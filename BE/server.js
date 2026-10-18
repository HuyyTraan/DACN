const express = require('express');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const swaggerUi = require('swagger-ui-express');
const { workspaceRouter, PostgresWorkspace } = require('./server/workspace');
const openapi = require('./api/openapi.json');
const { createSocial } = require('./server/social');
const { createPublishing, publishingRouter, PublishingRepository } = require('./server/publishing');
const { createAuth } = require('./server/auth');
const { resourceRouter } = require('./server/resources');
const { audit } = require('./server/data-store');
const { publishDurably } = require('./server/publish-receipts');
const { automationRouter } = require('./server/automation');

function createApp({ authentication = true, pool = null, socialService = null } = {}) {
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'same-origin',
            'X-Frame-Options': 'DENY'
        });
        res.set(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"
        );
        next();
    });
    app.use(express.json({ limit: '5mb' }));
    app.use('/api', (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    const auth = createAuth(process.env, pool);
    app.use('/api/auth', auth.router);
    if (authentication)
        app.use('/api', (req, res, next) => {
            if (
                ['/health', '/docs', '/openapi.json', '/postman'].some(
                    (p) => req.path === p || req.path.startsWith(p + '/')
                ) ||
                ['/social/facebook/callback', '/social/threads/callback'].includes(req.path)
            )
                return next();
            auth.middleware(req, res, () => {
                if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
                    if (req.actor.role === 'viewer')
                        return res
                            .status(403)
                            .json({ error: 'Vai trò chỉ xem không được thay đổi dữ liệu.' });
                    if (
                        req.actor.role === 'editor' &&
                        (req.path.startsWith('/social') ||
                            req.path === '/publish/facebook' ||
                            (req.path.startsWith('/publishing') &&
                                (!['draft', 'pending'].includes(req.body?.status) ||
                                    (req.method !== 'POST' && req.method !== 'PUT'))))
                    )
                        return res
                            .status(403)
                            .json({ error: 'Chỉ người quản lý được liên kết, duyệt và đăng bài.' });
                    const send = res.json.bind(res);
                    res.json = (body) => {
                        if (res.auditPending) return res;
                        res.auditPending = true;
                        audit(
                            auth.pool,
                            req.actor,
                            req.method.toLowerCase(),
                            req.path,
                            null,
                            null,
                            { status: res.statusCode }
                        )
                            .then(() => send(body))
                            .catch(() => {
                                res.status(503);
                                send({
                                    error: 'Chưa lưu được nhật ký hoạt động. Kiểm tra dữ liệu trước khi gửi lại.'
                                });
                            });
                        return res;
                    };
                }
                next();
            });
        });
    app.use(
        '/api',
        resourceRouter(
            auth.pool,
            auth,
            process.env.DATABASE_URL && !pool ? require('./server/prisma') : null
        )
    );
    const social = socialService || createSocial();
    if (authentication)
        app.use('/api/social/accounts', (req, res, next) => {
            if (req.method !== 'GET') return next();
            const send = res.json.bind(res);
            res.json = (body) => {
                if (!body.accounts) return send(body);
                Promise.all(
                    body.accounts.map((a) =>
                        auth.pool.query(
                            'INSERT INTO studio_social_accounts(id,workspace_id,name,platform,status,payload) VALUES($1,1,$2,$3,$4,$5::jsonb) ON CONFLICT(workspace_id,id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=now()',
                            [a.id, a.name, a.platform, a.status, JSON.stringify(a)]
                        )
                    )
                )
                    .then(() => send(body))
                    .catch(() =>
                        res
                            .status(503)
                            .send({ error: 'Chưa lưu được danh tính tài khoản vào database.' })
                    );
                return res;
            };
            next();
        });
    app.use('/api/social', social.router);
    app.use('/api/automation', automationRouter(auth.pool));
    app.use(
        '/api/publishing',
        pool
            ? publishingRouter({ repository: new PublishingRepository(pool), social })
            : createPublishing(social).router
    );
    app.use('/api/workspace', workspaceRouter(pool ? new PostgresWorkspace(pool) : undefined));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
    app.get('/api/openapi.json', (req, res) => res.json(openapi));
    app.get('/api/postman', (req, res) =>
        res.download(path.join(__dirname, 'api/omni-studio.postman_collection.json'))
    );
    app.get('/api/rpa-example', (req, res) =>
        res.download(path.join(__dirname, 'rpa/workspace.robot'))
    );
    app.get('/api/health', (req, res) =>
        res.json({ status: 'ok', storage: process.env.DATABASE_URL ? 'postgres' : 'demo' })
    );
    app.use(express.static(path.join(__dirname, '../FE/dist')));

    app.post('/api/publish/facebook', social.localOnly, async (req, res) => {
        try {
            res.json(
                authentication
                    ? await publishDurably(auth.pool, social, req.body, req.actor)
                    : await social.publish(req.body)
            );
        } catch (error) {
            const result = social.publicError(error);
            res.status(result.status).json({ success: false, ...result });
        }
    });

    app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint không tồn tại' }));
    app.use((error, req, res, next) => {
        res.status(error.status === 413 ? 413 : 400).json({
            error: error.status === 413 ? 'Dữ liệu quá lớn (tối đa 5 MB)' : 'Request không hợp lệ'
        });
    });

    return app;
}
const app = createApp();
if (require.main === module) {
    if (process.env.DATABASE_URL) {
        const expiry = new PublishingRepository(
            new (require('pg').Pool)({
                connectionString: process.env.DATABASE_URL,
                max: 2,
                connectionTimeoutMillis: 3000
            })
        );
        let expiring = false;
        const sweep = async () => {
            if (expiring) return;
            expiring = true;
            try {
                await expiry.expirePending();
                await expiry.expireScheduled();
                await require('./server/approval-expiry').expireWorkspace(expiry.pool);
            } catch {
                console.error(
                    'Chưa kiểm tra được lịch hết hạn. Kiểm tra kết nối PostgreSQL và migration.'
                );
            } finally {
                expiring = false;
            }
        };
        sweep();
        setInterval(sweep, 30000).unref();
    }
    const port = process.env.PORT || 3000;
    app.listen(port, process.env.HOST || '127.0.0.1', () =>
        console.log(`Omni Studio đang chạy tại http://localhost:${port}`)
    );
}

module.exports = app;
module.exports.createApp = createApp;

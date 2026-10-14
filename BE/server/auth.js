const express = require('express');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { Pool } = require('pg');
const { audit } = require('./data-store');
const scrypt = promisify(crypto.scrypt);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const roles = ['admin', 'manager', 'editor', 'viewer'];
const dto = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active });
async function passwordHash(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return salt + ':' + (await scrypt(password, salt, 64)).toString('hex');
}
async function passwordMatches(password, encoded) {
    const [salt, key] = (encoded || '').split(':');
    const actual = await scrypt(password, salt || 'invalid', 64);
    const expected = Buffer.from(key || '', 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function validIdentity(body, withPassword = true) {
    return (
        body &&
        typeof body.email === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) &&
        body.email.length <= 254 &&
        typeof body.name === 'string' &&
        body.name.trim().length > 0 &&
        body.name.length <= 100 &&
        (!withPassword || validPassword(body.password))
    );
}
const validPassword = (p) => typeof p === 'string' && p.length >= 12 && p.length <= 128;
function createAuth(env = process.env, providedPool) {
    const pool =
        providedPool ||
        (env.DATABASE_URL
            ? new Pool({
                  connectionString: env.DATABASE_URL,
                  max: 4,
                  connectionTimeoutMillis: 3000,
                  query_timeout: 5000
              })
            : null);
    const router = express.Router();
    const attempts = new Map();
    const cookie = (req, key) =>
        new RegExp('(?:^|;\\s*)' + key + '=([a-f0-9]{64})(?:;|$)').exec(
            req.get('Cookie') || ''
        )?.[1];
    const fail = (status, message) => Object.assign(new Error(message), { status });
    const endpoint = (fn) => async (req, res) => {
        try {
            if (!pool) throw fail(503, 'Cần kết nối PostgreSQL để đăng nhập.');
            await fn(req, res);
        } catch (e) {
            res.status(e.status || 503).json({
                error: e.status
                    ? e.message
                    : 'Chưa truy cập được database. Kiểm tra migration và kết nối.'
            });
        }
    };
    const originAllowed = (req) => {
        const origin = req.get('Origin');
        return (
            !origin ||
            [
                `${req.protocol}://${req.get('Host')}`,
                env.SOCIAL_UI_ORIGIN,
                'http://localhost:5173',
                'http://127.0.0.1:5173'
            ]
                .filter(Boolean)
                .includes(origin)
        );
    };
    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (!originAllowed(req))
            return res.status(403).json({ error: 'Nguồn yêu cầu không được phép.' });
        next();
    });
    async function actor(req) {
        if (!pool) return null;
        const token = cookie(req, 'omni_session');
        if (!token) return null;
        const result = await pool.query(
            'SELECT u.*,s.csrf_hash FROM studio_sessions s JOIN studio_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true',
            [hash(token)]
        );
        return result.rows[0] || null;
    }
    async function session(req, res, user) {
        const token = crypto.randomBytes(32).toString('hex'),
            csrf = crypto.randomBytes(32).toString('hex');
        await pool.query(
            "INSERT INTO studio_sessions(token_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",
            [hash(token), user.id, hash(csrf)]
        );
        const options = {
            sameSite: 'strict',
            secure: req.secure || env.NODE_ENV === 'production',
            path: '/',
            maxAge: 12 * 3600000
        };
        res.cookie('omni_session', token, { ...options, httpOnly: true });
        res.cookie('omni_csrf', csrf, options);
        res.json({ user: dto(user) });
    }
    router.get(
        '/session',
        endpoint(async (req, res) => {
            const user = await actor(req);
            const count = await pool.query('SELECT count(*)::int AS count FROM studio_users');
            res.json({
                user: user ? dto(user) : null,
                bootstrapRequired: count.rows[0].count === 0
            });
        })
    );
    const limit = (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        let a = attempts.get(key);
        if (!a || a.until < now) {
            a = { count: 0, until: now + 15 * 60000 };
            attempts.set(key, a);
        }
        if (++a.count > 15)
            return res.status(429).json({ error: 'Quá nhiều lần thử. Thử lại sau 15 phút.' });
        if (attempts.size > 1000)
            for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
        next();
    };
    router.post(
        '/bootstrap',
        limit,
        endpoint(async (req, res) => {
            if (!validIdentity(req.body))
                throw fail(400, 'Nhập tên, email hợp lệ và mật khẩu từ 12–128 ký tự.');
            const encoded = await passwordHash(req.body.password),
                db = await pool.connect();
            let user;
            try {
                await db.query('BEGIN');
                await db.query('SELECT pg_advisory_xact_lock(723019)');
                const count = await db.query('SELECT count(*)::int AS count FROM studio_users');
                if (count.rows[0].count)
                    throw fail(
                        409,
                        'Đã có quản trị viên. Đăng nhập hoặc nhờ quản trị viên cấp tài khoản.'
                    );
                user = (
                    await db.query(
                        "INSERT INTO studio_users(id,workspace_id,email,name,password_hash,role) VALUES($1,1,$2,$3,$4,'admin') RETURNING *",
                        [
                            crypto.randomUUID(),
                            req.body.email.trim().toLowerCase(),
                            req.body.name.trim(),
                            encoded
                        ]
                    )
                ).rows[0];
                await audit(db, user, 'bootstrap', 'users', user.id, null, dto(user));
                await db.query('COMMIT');
            } catch (e) {
                await db.query('ROLLBACK');
                throw e;
            } finally {
                db.release();
            }
            await session(req, res, user);
        })
    );
    router.post(
        '/login',
        limit,
        endpoint(async (req, res) => {
            if (
                typeof req.body?.email !== 'string' ||
                typeof req.body?.password !== 'string' ||
                req.body.password.length > 128
            )
                throw fail(400, 'Nhập email và mật khẩu.');
            const result = await pool.query('SELECT * FROM studio_users WHERE email=$1', [
                req.body.email.trim().toLowerCase()
            ]);
            const user = result.rows[0];
            if (!(await passwordMatches(req.body.password, user?.password_hash)) || !user?.active)
                throw fail(401, 'Email hoặc mật khẩu không đúng.');
            await audit(pool, user, 'login', 'users', user.id, null, null);
            await session(req, res, user);
        })
    );
    const authenticate = endpoint(async (req, res) => {
        const user = await actor(req);
        if (!user) throw fail(401, 'Bạn cần đăng nhập.');
        req.actor = dto(user);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            const csrf = req.get('X-CSRF-Token');
            if (!originAllowed(req) || !csrf || hash(csrf) !== user.csrf_hash)
                throw fail(403, 'Phiên bảo mật không hợp lệ. Tải lại trang.');
        }
        // The next callback is set by the Express wrapper below.
        req.authNext();
    });
    const middleware = (req, res, next) => {
        req.authNext = next;
        return authenticate(req, res);
    };
    const allow = (accepted) => (req, res, next) =>
        accepted.includes(req.actor?.role)
            ? next()
            : res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
    router.post(
        '/logout',
        middleware,
        endpoint(async (req, res) => {
            await pool.query('DELETE FROM studio_sessions WHERE token_hash=$1', [
                hash(cookie(req, 'omni_session'))
            ]);
            res.clearCookie('omni_session', { path: '/' });
            res.clearCookie('omni_csrf', { path: '/' });
            res.json({ success: true });
        })
    );
    router.post(
        '/password',
        middleware,
        endpoint(async (req, res) => {
            if (!validPassword(req.body?.password) || typeof req.body?.currentPassword !== 'string')
                throw fail(400, 'Mật khẩu mới phải từ 12–128 ký tự.');
            const u = (
                await pool.query('SELECT password_hash FROM studio_users WHERE id=$1', [
                    req.actor.id
                ])
            ).rows[0];
            if (!(await passwordMatches(req.body.currentPassword, u.password_hash)))
                throw fail(401, 'Mật khẩu hiện tại không đúng.');
            await pool.query(
                'UPDATE studio_users SET password_hash=$2,updated_at=now() WHERE id=$1',
                [req.actor.id, await passwordHash(req.body.password)]
            );
            await pool.query('DELETE FROM studio_sessions WHERE user_id=$1', [req.actor.id]);
            await audit(pool, req.actor, 'password.change', 'users', req.actor.id, null, null);
            res.clearCookie('omni_session', { path: '/' });
            res.json({ success: true });
        })
    );
    router.get(
        '/users',
        middleware,
        allow(['admin']),
        endpoint(async (req, res) =>
            res.json({
                users: (
                    await pool.query(
                        'SELECT id,email,name,role,active FROM studio_users ORDER BY created_at'
                    )
                ).rows
            })
        )
    );
    router.post(
        '/users',
        middleware,
        allow(['admin']),
        endpoint(async (req, res) => {
            if (!validIdentity(req.body) || !roles.includes(req.body.role))
                throw fail(400, 'Thông tin tài khoản không hợp lệ.');
            let u;
            try {
                u = (
                    await pool.query(
                        'INSERT INTO studio_users(id,workspace_id,email,name,password_hash,role) VALUES($1,1,$2,$3,$4,$5) RETURNING *',
                        [
                            crypto.randomUUID(),
                            req.body.email.trim().toLowerCase(),
                            req.body.name.trim(),
                            await passwordHash(req.body.password),
                            req.body.role
                        ]
                    )
                ).rows[0];
            } catch (e) {
                if (e.code === '23505') throw fail(409, 'Email đã tồn tại.');
                throw e;
            }
            await audit(pool, req.actor, 'user.create', 'users', u.id, null, dto(u));
            res.status(201).json({ user: dto(u) });
        })
    );
    router.patch(
        '/users/:id',
        middleware,
        allow(['admin']),
        endpoint(async (req, res) => {
            if (
                !/^[a-f0-9-]{36}$/i.test(req.params.id) ||
                !roles.includes(req.body?.role) ||
                typeof req.body?.active !== 'boolean'
            )
                throw fail(400, 'Vai trò/trạng thái không hợp lệ.');
            const db = await pool.connect();
            try {
                await db.query('BEGIN');
                await db.query('SELECT pg_advisory_xact_lock(723020)');
                const prior = (
                    await db.query('SELECT * FROM studio_users WHERE id=$1 FOR UPDATE', [
                        req.params.id
                    ])
                ).rows[0];
                if (!prior) throw fail(404, 'Không tìm thấy tài khoản.');
                const admins = (
                    await db.query(
                        "SELECT count(*)::int AS count FROM studio_users WHERE role='admin' AND active=true"
                    )
                ).rows[0].count;
                if (
                    prior.role === 'admin' &&
                    prior.active &&
                    admins === 1 &&
                    (req.body.role !== 'admin' || !req.body.active)
                )
                    throw fail(409, 'Phải giữ ít nhất một quản trị viên đang hoạt động.');
                const u = (
                    await db.query(
                        'UPDATE studio_users SET role=$2,active=$3,updated_at=now() WHERE id=$1 RETURNING *',
                        [req.params.id, req.body.role, req.body.active]
                    )
                ).rows[0];
                await db.query('DELETE FROM studio_sessions WHERE user_id=$1', [u.id]);
                await audit(db, req.actor, 'user.update', 'users', u.id, dto(prior), dto(u));
                await db.query('COMMIT');
                res.json({ user: dto(u) });
            } catch (e) {
                await db.query('ROLLBACK');
                throw e;
            } finally {
                db.release();
            }
        })
    );
    router.post(
        '/users/:id/password',
        middleware,
        allow(['admin']),
        endpoint(async (req, res) => {
            if (
                !/^[a-f0-9-]{36}$/i.test(req.params.id) ||
                !validPassword(req.body?.password) ||
                typeof req.body?.adminPassword !== 'string' ||
                req.body.adminPassword.length > 128
            )
                throw fail(
                    400,
                    'Mật khẩu mới phải từ 12–128 ký tự và cần xác nhận mật khẩu quản trị viên.'
                );
            const admin = (
                await pool.query('SELECT password_hash FROM studio_users WHERE id=$1', [
                    req.actor.id
                ])
            ).rows[0];
            if (!(await passwordMatches(req.body.adminPassword, admin.password_hash)))
                throw fail(401, 'Mật khẩu quản trị viên không đúng.');
            const encoded = await passwordHash(req.body.password),
                db = await pool.connect();
            try {
                await db.query('BEGIN');
                const updated = await db.query(
                    'UPDATE studio_users SET password_hash=$2,updated_at=now() WHERE id=$1 RETURNING id',
                    [req.params.id, encoded]
                );
                if (!updated.rows.length) throw fail(404, 'Không tìm thấy tài khoản.');
                await db.query('DELETE FROM studio_sessions WHERE user_id=$1', [req.params.id]);
                await audit(db, req.actor, 'password.reset', 'users', req.params.id, null, null);
                await db.query('COMMIT');
                res.json({ success: true });
            } catch (e) {
                await db.query('ROLLBACK');
                throw e;
            } finally {
                db.release();
            }
        })
    );
    return { router, middleware, allow, pool };
}
module.exports = { createAuth, passwordHash, passwordMatches, validPassword };

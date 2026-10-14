const express = require('express');
const axios = require('axios');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const providers = ['Facebook', 'Instagram', 'Google', 'TikTok', 'YouTube', 'Zalo', 'LinkedIn', 'X'];
class SocialError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function publicError(error) {
    if (error instanceof SocialError) return { status: error.status, error: error.message };
    const code = error.response?.data?.error?.code;
    return {
        status: code === 190 ? 401 : [10, 200].includes(code) ? 403 : 502,
        error:
            code === 190
                ? 'Token Facebook không hợp lệ hoặc đã hết hạn. Hãy liên kết lại.'
                : [10, 200].includes(code)
                  ? 'Facebook từ chối quyền. Kiểm tra quyền đăng/đọc bài và quyền quản lý Page.'
                  : 'Không thể hoàn tất yêu cầu với Facebook. Kiểm tra kết nối và thử lại.',
        ...(Number.isInteger(code) ? { providerCode: code } : {})
    };
}
function decodeImage(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > 1500000)
        throw new SocialError(400, 'Ảnh tối đa 1 MB.');
    const match = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) throw new SocialError(400, 'Chọn ảnh JPG, PNG, WebP hoặc GIF hợp lệ.');
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 1024 * 1024 || buffer.toString('base64') !== match[2])
        throw new SocialError(400, 'Ảnh không hợp lệ hoặc vượt quá 1 MB.');
    const type = match[1];
    const signatures = {
        jpeg: buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
        png: buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        gif: ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString()),
        webp:
            buffer.subarray(0, 4).toString() === 'RIFF' &&
            buffer.subarray(8, 12).toString() === 'WEBP'
    };
    if (!signatures[type]) throw new SocialError(400, 'Nội dung file không khớp định dạng ảnh.');
    return { buffer, mime: `image/${type}`, extension: type === 'jpeg' ? 'jpg' : type };
}
class TokenVault {
    constructor(env, file = path.join(__dirname, '../.data/social-tokens.enc')) {
        this.env = env;
        this.file = file;
    }
    key() {
        const key = Buffer.from(this.env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64');
        if (key.length !== 32)
            throw new SocialError(
                503,
                'Cần SOCIAL_TOKEN_ENCRYPTION_KEY (32 byte base64) để lưu liên kết.'
            );
        return key;
    }
    read() {
        if (!fs.existsSync(this.file)) return [];
        try {
            const payload = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                this.key(),
                Buffer.from(payload.iv, 'base64')
            );
            decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
            return JSON.parse(
                Buffer.concat([
                    decipher.update(Buffer.from(payload.data, 'base64')),
                    decipher.final()
                ]).toString()
            );
        } catch {
            throw new SocialError(
                503,
                'Không thể đọc kho token. Kiểm tra khóa mã hóa, không xóa file để sửa lỗi.'
            );
        }
    }
    write(accounts) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
        const data = Buffer.concat([cipher.update(JSON.stringify(accounts)), cipher.final()]);
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(
            `${this.file}.tmp`,
            JSON.stringify({
                iv: iv.toString('base64'),
                tag: cipher.getAuthTag().toString('base64'),
                data: data.toString('base64')
            }),
            { mode: 0o600 }
        );
        fs.renameSync(`${this.file}.tmp`, this.file);
    }
}
function createSocial({ env = process.env, http = axios, vault = new TokenVault(env) } = {}) {
    const router = express.Router();
    const sessions = new Map();
    const requests = new Map();
    const version = () =>
        /^v\d+\.\d+$/.test(env.GRAPH_API_VERSION || '') ? env.GRAPH_API_VERSION : 'v21.0';
    const graph = () => `https://graph.facebook.com/${version()}`;
    const uiOrigin = () =>
        new URL(env.SOCIAL_UI_ORIGIN || `http://localhost:${env.PORT || 3000}`).origin;
    const redirectUri = () =>
        env.FACEBOOK_REDIRECT_URI ||
        `http://localhost:${env.PORT || 3000}/api/social/facebook/callback`;
    const configured = () =>
        Boolean(
            env.FACEBOOK_APP_ID &&
            env.FACEBOOK_APP_SECRET &&
            Buffer.from(env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64').length === 32
        );
    const options = (token, params) => ({
        timeout: 15000,
        headers: { Authorization: `Bearer ${token}` },
        params
    });
    const credentials = () => {
        const accounts = new Map();
        if (env.PAGE_ID && env.PAGE_ACCESS_TOKEN)
            accounts.set(`facebook:${env.PAGE_ID}`, {
                id: `facebook:${env.PAGE_ID}`,
                pageId: env.PAGE_ID,
                token: env.PAGE_ACCESS_TOKEN,
                source: 'env'
            });
        for (const account of vault.read())
            accounts.set(account.id, { ...account, source: 'oauth' });
        return [...accounts.values()];
    };
    const credential = (id) => {
        const account = credentials().find((a) => a.id === id);
        if (!account) throw new SocialError(404, 'Tài khoản chưa được liên kết.');
        return account;
    };
    const metadata = async (account) => {
        const response = await http.get(
            `${graph()}/me`,
            options(account.token, { fields: 'id,name,picture.type(large)' })
        );
        if (response.data.id !== account.pageId)
            throw new SocialError(401, 'Token không thuộc Page đã chọn.');
        if (typeof response.data.name !== 'string' || !response.data.name.trim())
            throw new SocialError(502, 'Facebook chưa trả về tên Page hợp lệ.');
        return {
            id: account.id,
            pageId: account.pageId,
            platform: 'Facebook',
            name: response.data.name,
            avatar: response.data.picture?.data?.url || '',
            source: account.source,
            status: 'connected',
            canPublish: true
        };
    };
    const safe = (handler) => async (req, res) => {
        try {
            await handler(req, res);
        } catch (error) {
            const result = publicError(error);
            res.status(result.status).json(result);
        }
    };
    // Browser mutations must originate from the local UI, not a third-party website.
    const localOnly = (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        const allowed = [
            uiOrigin(),
            `http://localhost:${env.PORT || 3000}`,
            `http://127.0.0.1:${env.PORT || 3000}`,
            'http://localhost:5173',
            'http://127.0.0.1:5173'
        ];
        if (
            !['GET', 'HEAD'].includes(req.method) &&
            (req.get('Sec-Fetch-Site') === 'cross-site' ||
                (req.get('Origin') && !allowed.includes(req.get('Origin'))))
        )
            return res.status(403).json({ error: 'Yêu cầu phải được gửi từ giao diện local.' });
        next();
    };
    router.use(localOnly);
    router.get(
        '/accounts',
        safe(async (req, res) => {
            const accounts = await Promise.all(
                credentials().map(async (account) => {
                    try {
                        return await metadata(account);
                    } catch (error) {
                        return {
                            id: account.id,
                            pageId: account.pageId,
                            name: account.name || `Facebook Page ${account.pageId}`,
                            platform: 'Facebook',
                            avatar: '',
                            canPublish: false,
                            status: 'needs_reconnect',
                            error: publicError(error).error,
                            source: account.source
                        };
                    }
                })
            );
            res.json({
                accounts,
                oauthConfigured: configured(),
                providers: providers.map((name) => ({ name, supported: name === 'Facebook' }))
            });
        })
    );
    router.get(
        '/facebook/connect',
        safe(async (req, res) => {
            if (!configured())
                throw new SocialError(
                    503,
                    'Cấu hình FACEBOOK_APP_ID, FACEBOOK_APP_SECRET và SOCIAL_TOKEN_ENCRYPTION_KEY trên backend trước.'
                );
            for (const [key, session] of sessions)
                if (session.expires < Date.now()) sessions.delete(key);
            if (sessions.size >= 100)
                throw new SocialError(429, 'Quá nhiều phiên liên kết. Thử lại sau.');
            const state = crypto.randomBytes(32).toString('hex');
            sessions.set(state, { expires: Date.now() + 10 * 60000 });
            res.cookie('omni_social', state, {
                httpOnly: true,
                sameSite: 'lax',
                secure: redirectUri().startsWith('https:'),
                maxAge: 10 * 60000,
                path: '/api/social'
            });
            const query = new URLSearchParams({
                client_id: env.FACEBOOK_APP_ID,
                redirect_uri: redirectUri(),
                state,
                scope: 'pages_show_list,pages_read_engagement,pages_manage_posts',
                response_type: 'code',
                auth_type: 'rerequest'
            });
            res.redirect(`https://www.facebook.com/${version()}/dialog/oauth?${query}`);
        })
    );
    function sessionFor(req) {
        const cookie = /(?:^|;\s*)omni_social=([a-f0-9]{64})(?:;|$)/.exec(
            req.get('Cookie') || ''
        )?.[1];
        const session = cookie && sessions.get(cookie);
        if (!session || session.expires < Date.now())
            throw new SocialError(401, 'Phiên liên kết đã hết hạn. Bắt đầu lại.');
        return { cookie, session };
    }
    router.get('/facebook/callback', async (req, res) => {
        try {
            const { cookie, session } = sessionFor(req);
            if (req.query.state !== cookie || session.pages || session.used)
                throw new SocialError(400, 'State OAuth không hợp lệ.');
            session.used = true;
            if (req.query.error || typeof req.query.code !== 'string')
                throw new SocialError(400, 'Bạn đã hủy hoặc Facebook chưa cấp quyền liên kết.');
            const token = await http.get(`${graph()}/oauth/access_token`, {
                timeout: 15000,
                params: {
                    client_id: env.FACEBOOK_APP_ID,
                    client_secret: env.FACEBOOK_APP_SECRET,
                    redirect_uri: redirectUri(),
                    code: req.query.code
                }
            });
            const long = await http.get(`${graph()}/oauth/access_token`, {
                timeout: 15000,
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: env.FACEBOOK_APP_ID,
                    client_secret: env.FACEBOOK_APP_SECRET,
                    fb_exchange_token: token.data.access_token
                }
            });
            const permissionResponse = await http.get(
                `${graph()}/me/permissions`,
                options(long.data.access_token)
            );
            const granted = new Set(
                (permissionResponse.data.data || [])
                    .filter((permission) => permission.status === 'granted')
                    .map((permission) => permission.permission)
            );
            if (
                !['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'].every(
                    (permission) => granted.has(permission)
                )
            )
                throw new SocialError(
                    403,
                    'Chưa cấp đủ quyền đọc danh sách Page, đọc bài và đăng bài. Liên kết lại và cấp các quyền cần thiết.'
                );
            let after;
            const pages = [];
            for (let n = 0; n < 10; n++) {
                const response = await http.get(
                    `${graph()}/me/accounts`,
                    options(long.data.access_token, {
                        fields: 'id,name,access_token,tasks,picture.type(large)',
                        limit: 100,
                        ...(after ? { after } : {})
                    })
                );
                pages.push(...response.data.data);
                after = response.data.paging?.next && response.data.paging?.cursors?.after;
                if (!after) break;
            }
            session.pages = pages.filter(
                (p) =>
                    p.access_token &&
                    (p.tasks || []).some((task) =>
                        [
                            'CREATE_CONTENT',
                            'MANAGE',
                            'PROFILE_PLUS_CREATE_CONTENT',
                            'PROFILE_PLUS_FULL_CONTROL'
                        ].includes(task)
                    )
            );
            if (!session.pages.length)
                throw new SocialError(
                    403,
                    'Facebook chưa trả về Page có quyền tạo nội dung. Kiểm tra quyền đã cấp và Page được chọn.'
                );
            res.redirect(`${uiOrigin()}/#connections`);
        } catch (error) {
            res.redirect(
                `${uiOrigin()}/?social_error=${encodeURIComponent(publicError(error).error)}#connections`
            );
        }
    });
    router.get(
        '/facebook/pages',
        safe(async (req, res) => {
            try {
                const { session } = sessionFor(req);
                res.json({
                    pages: (session.pages || []).map((p) => ({
                        id: p.id,
                        name: p.name,
                        avatar: p.picture?.data?.url || ''
                    }))
                });
            } catch (error) {
                if (error.status === 401) return res.json({ pages: [] });
                throw error;
            }
        })
    );
    router.post(
        '/facebook/pages',
        safe(async (req, res) => {
            const { cookie, session } = sessionFor(req);
            const ids = req.body?.pageIds;
            if (
                !Array.isArray(ids) ||
                !ids.length ||
                ids.length > 50 ||
                !ids.every((id) => typeof id === 'string')
            )
                throw new SocialError(400, 'Chọn ít nhất một Page.');
            const selected = ids.map((id) => session.pages?.find((p) => p.id === id));
            if (selected.some((p) => !p))
                throw new SocialError(403, 'Page không thuộc phiên cấp quyền hiện tại.');
            const existing = new Map(vault.read().map((a) => [a.id, a]));
            for (const page of selected)
                existing.set(`facebook:${page.id}`, {
                    id: `facebook:${page.id}`,
                    pageId: page.id,
                    token: page.access_token,
                    name: page.name
                });
            if (existing.size > 50)
                throw new SocialError(400, 'Tối đa 50 Page trong một workspace local.');
            vault.write([...existing.values()]);
            sessions.delete(cookie);
            res.clearCookie('omni_social', { path: '/api/social' });
            res.json({ connected: selected.length });
        })
    );
    router.delete(
        '/accounts/:id',
        safe(async (req, res) => {
            const account = credential(req.params.id);
            if (account.source === 'env' || account.pageId === env.PAGE_ID)
                throw new SocialError(
                    409,
                    'Liên kết này đến từ BE/.env. Xóa PAGE_ID/PAGE_ACCESS_TOKEN trong file rồi khởi động lại BE để ngắt.'
                );
            vault.write(vault.read().filter((a) => a.id !== account.id));
            res.json({ disconnected: true });
        })
    );
    router.get(
        '/accounts/:id/posts',
        safe(async (req, res) => {
            const account = credential(req.params.id);
            const after = req.query.after;
            const range = {};
            for (const key of ['since', 'until']) {
                if (req.query[key] !== undefined) {
                    const value = req.query[key];
                    if (
                        typeof value !== 'string' ||
                        !/^\d{1,10}$/.test(value) ||
                        Number(value) > 4102444800
                    )
                        throw new SocialError(400, 'Khoảng ngày không hợp lệ.');
                    range[key] = Number(value);
                }
            }
            if (
                Object.keys(range).length &&
                (range.since === undefined ||
                    range.until === undefined ||
                    range.until <= range.since ||
                    range.until - range.since > 366 * 86400)
            )
                throw new SocialError(400, 'Chọn khoảng ngày tối đa 366 ngày.');
            if (
                after &&
                (typeof after !== 'string' ||
                    after.length > 2048 ||
                    !/^[A-Za-z0-9_+=/-]+$/.test(after))
            )
                throw new SocialError(400, 'Cursor không hợp lệ.');
            const response = await http.get(
                `${graph()}/${account.pageId}/published_posts`,
                options(account.token, {
                    fields: 'id,message,created_time,permalink_url,full_picture',
                    limit: 25,
                    ...range,
                    ...(after ? { after } : {})
                })
            );
            res.json({
                posts: response.data.data.map((p) => ({
                    id: p.id,
                    message: p.message || '',
                    createdTime: p.created_time,
                    permalink: p.permalink_url || '',
                    image: p.full_picture || ''
                })),
                nextCursor: response.data.paging?.next
                    ? response.data.paging.cursors?.after || null
                    : null
            });
        })
    );
    function ownedPost(account, postId) {
        if (!/^[0-9]+_[0-9]+$/.test(postId) || !postId.startsWith(`${account.pageId}_`))
            throw new SocialError(403, 'Bài viết không thuộc Page đã chọn.');
    }
    router.patch(
        '/accounts/:id/posts/:postId',
        safe(async (req, res) => {
            const account = credential(req.params.id);
            ownedPost(account, req.params.postId);
            const message = req.body?.message;
            if (typeof message !== 'string' || !message.trim() || message.length > 63206)
                throw new SocialError(400, 'Nội dung bài viết không hợp lệ.');
            await http.post(`${graph()}/${req.params.postId}`, { message }, options(account.token));
            res.json({ updated: true });
        })
    );
    router.delete(
        '/accounts/:id/posts/:postId',
        safe(async (req, res) => {
            const account = credential(req.params.id);
            ownedPost(account, req.params.postId);
            await http.delete(`${graph()}/${req.params.postId}`, options(account.token));
            res.json({ deleted: true });
        })
    );
    async function publish(body) {
        const text = body?.noiDungBaiViet;
        if (typeof text !== 'string' || !text.trim() || text.length > 63206)
            throw new SocialError(400, 'Thiếu nội dung bài viết hoặc nội dung vượt giới hạn.');
        const image = decodeImage(body.image);
        if (!body.accountId && (!env.PAGE_ID || !env.PAGE_ACCESS_TOKEN))
            throw new SocialError(503, 'Chưa cấu hình tài khoản Facebook trên máy chủ');
        const account = credential(body.accountId || `facebook:${env.PAGE_ID}`);
        const requestId = body.requestId;
        if (requestId && (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)))
            throw new SocialError(400, 'Request ID không hợp lệ.');
        for (const [key, value] of requests) if (value.expires < Date.now()) requests.delete(key);
        const fingerprint = crypto
            .createHash('sha256')
            .update(JSON.stringify([account.id, text, body.image || '']))
            .digest('hex');
        if (requestId && requests.has(requestId)) {
            const prior = requests.get(requestId);
            if (prior.fingerprint !== fingerprint)
                throw new SocialError(409, 'Request ID đã dùng với nội dung khác.');
            if (prior.result) return prior.result;
            throw new SocialError(
                409,
                'Yêu cầu đã gửi hoặc kết quả chưa xác định. Kiểm tra bài trên Page trước khi đăng lại.'
            );
        }
        if (requestId) {
            if (requests.size >= 500) throw new SocialError(429, 'Quá nhiều yêu cầu đăng.');
            requests.set(requestId, { fingerprint, expires: Date.now() + 24 * 3600000 });
        }
        let response;
        if (image) {
            const form = new FormData();
            form.append(
                'source',
                new Blob([image.buffer], { type: image.mime }),
                `photo.${image.extension}`
            );
            form.append('caption', text);
            response = await http.post(
                `${graph()}/${account.pageId}/photos`,
                form,
                options(account.token)
            );
        } else
            response = await http.post(
                `${graph()}/${account.pageId}/feed`,
                { message: text },
                options(account.token)
            );
        const postId = image ? response.data.post_id : response.data.id;
        const result = {
            success: true,
            message: 'Đã đăng lên Fanpage thành công!',
            facebookPostId: postId || response.data.id,
            accountId: account.id,
            permalink: postId ? `https://www.facebook.com/${postId}` : ''
        };
        if (requestId) requests.get(requestId).result = result;
        return result;
    }
    return {
        router,
        publish,
        publicError,
        localOnly,
        hasAccount: (id) => credentials().some((a) => a.id === id)
    };
}
module.exports = { createSocial, TokenVault, decodeImage, publicError, SocialError };

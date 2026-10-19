const express = require('express');
const axios = require('axios');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { withTemporaryPublicImage, cloudflaredAvailable } = require('./instagram-media-tunnel');

const providers = [
    'Facebook',
    'Instagram',
    'Threads',
    'Google',
    'TikTok',
    'YouTube',
    'Zalo',
    'LinkedIn',
    'X'
];
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
                ? 'Token Meta không hợp lệ hoặc đã hết hạn. Hãy liên kết lại tài khoản.'
                : [10, 200].includes(code)
                  ? 'Meta từ chối quyền. Kiểm tra quyền đăng/đọc nội dung và tài khoản đã liên kết.'
                  : 'Không thể hoàn tất yêu cầu với Meta. Kiểm tra kết nối và trạng thái tài khoản.',
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
function mediaStorageConfigured(env) {
    return Boolean(
        env.INSTAGRAM_MEDIA_ENDPOINT &&
        env.INSTAGRAM_MEDIA_BUCKET &&
        env.INSTAGRAM_MEDIA_ACCESS_KEY &&
        env.INSTAGRAM_MEDIA_SECRET_KEY &&
        /^https:\/\//.test(env.INSTAGRAM_MEDIA_PUBLIC_ORIGIN || '') &&
        /^https:\/\//.test(env.INSTAGRAM_MEDIA_ENDPOINT)
    );
}
function mediaHostingAvailable(env) {
    return (
        mediaStorageConfigured(env) ||
        (env.INSTAGRAM_MEDIA_TUNNEL_ENABLED !== 'false' && cloudflaredAvailable())
    );
}
function hmac(key, value, encoding) {
    return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}
async function putPublicMedia(env, http, image, platform = 'Instagram') {
    if (!mediaStorageConfigured(env))
        throw new SocialError(503, 'Cần cấu hình kho media công khai Instagram trên BE/.env.');
    const endpoint = new URL(env.INSTAGRAM_MEDIA_ENDPOINT);
    const region = env.INSTAGRAM_MEDIA_REGION || 'auto';
    const key = `${platform.toLowerCase()}/${crypto.randomUUID()}.${image.extension}`;
    const basePath = endpoint.pathname.replace(/\/$/, '');
    const objectPath = `${basePath}/${encodeURIComponent(env.INSTAGRAM_MEDIA_BUCKET)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const url = new URL(endpoint);
    url.pathname = objectPath;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const payloadHash = crypto.createHash('sha256').update(image.buffer).digest('hex');
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const canonicalRequest = `PUT\n${url.pathname}\n\n${canonicalHeaders}${signedHeaders}\n${payloadHash}`;
    const scope = `${day}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const dateKey = hmac(`AWS4${env.INSTAGRAM_MEDIA_SECRET_KEY}`, day);
    const regionKey = hmac(dateKey, region);
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = hmac(signingKey, stringToSign, 'hex');
    await http.put(url.toString(), image.buffer, {
        timeout: 20000,
        headers: {
            Authorization: `AWS4-HMAC-SHA256 Credential=${env.INSTAGRAM_MEDIA_ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
            'Content-Type': image.mime,
            'Content-Length': image.buffer.length,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate
        }
    });
    return `${env.INSTAGRAM_MEDIA_PUBLIC_ORIGIN.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
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
function createSocial({
    env = process.env,
    http = axios,
    vault = new TokenVault(env),
    temporaryMedia = withTemporaryPublicImage
} = {}) {
    const router = express.Router();
    const sessions = new Map();
    const requests = new Map();
    const discoveredAccounts = new Map();
    const version = () =>
        /^v\d+\.\d+$/.test(env.GRAPH_API_VERSION || '') ? env.GRAPH_API_VERSION : 'v21.0';
    const graph = () => `https://graph.facebook.com/${version()}`;
    const uiOrigin = () =>
        new URL(env.SOCIAL_UI_ORIGIN || `http://localhost:${env.PORT || 3000}`).origin;
    const redirectUri = () =>
        env.FACEBOOK_REDIRECT_URI ||
        `http://localhost:${env.PORT || 3000}/api/social/facebook/callback`;
    const threadsRedirectUri = () => env.THREADS_REDIRECT_URI || '';
    const validThreadsRedirectUri = () => {
        try {
            const uri = new URL(threadsRedirectUri());
            return uri.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(uri.hostname);
        } catch {
            return false;
        }
    };
    const configured = () =>
        Boolean(
            env.FACEBOOK_APP_ID &&
            env.FACEBOOK_APP_SECRET &&
            Buffer.from(env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64').length === 32
        );
    const threadsConfigured = () =>
        Boolean(
            env.THREADS_APP_ID &&
            env.THREADS_APP_SECRET &&
            validThreadsRedirectUri() &&
            Buffer.from(env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64').length === 32
        );
    const threadsGraph = () => 'https://graph.threads.net';
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
        for (const account of [...vault.read(), ...discoveredAccounts.values()])
            accounts.set(account.id, { ...account, source: account.source || 'oauth' });
        return [...accounts.values()];
    };
    const credential = (id) => {
        const account = credentials().find((a) => a.id === id);
        if (!account) throw new SocialError(404, 'Tài khoản chưa được liên kết.');
        return account;
    };
    const metadata = async (account) => {
        if (account.platform === 'Threads') {
            const response = await http.get(
                `${threadsGraph()}/me`,
                options(account.token, { fields: 'id,username,threads_profile_picture_url' })
            );
            if (response.data.id !== account.threadsUserId)
                throw new SocialError(401, 'Token không thuộc tài khoản Threads đã liên kết.');
            return {
                id: account.id,
                threadsUserId: account.threadsUserId,
                platform: 'Threads',
                name: response.data.username || account.name || `Threads ${account.threadsUserId}`,
                avatar: response.data.threads_profile_picture_url || '',
                source: account.source,
                status: 'connected',
                canPublish: true
            };
        }
        if (account.platform === 'Instagram') {
            const response = await http.get(
                `${graph()}/${account.instagramUserId}`,
                options(account.token, { fields: 'id,username,profile_picture_url' })
            );
            if (response.data.id !== account.instagramUserId)
                throw new SocialError(401, 'Token không thuộc tài khoản Instagram đã liên kết.');
            return {
                id: account.id,
                pageId: account.pageId,
                instagramUserId: account.instagramUserId,
                platform: 'Instagram',
                name:
                    response.data.username ||
                    account.name ||
                    `Instagram ${account.instagramUserId}`,
                avatar: response.data.profile_picture_url || '',
                source: account.source,
                status: 'connected',
                canPublish: mediaHostingAvailable(env),
                publishBlockedReason: mediaHostingAvailable(env)
                    ? ''
                    : 'Cần cài Cloudflare Tunnel hoặc cấu hình kho media công khai để Meta tải ảnh.'
            };
        }
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
    const linkedInstagram = async (account) => {
        const response = await http.get(
            `${graph()}/${account.pageId}`,
            options(account.token, { fields: 'instagram_business_account' })
        );
        const instagramUserId = response.data.instagram_business_account?.id;
        if (typeof instagramUserId !== 'string' || !/^\d+$/.test(instagramUserId)) return null;
        return {
            id: `instagram:${instagramUserId}`,
            platform: 'Instagram',
            pageId: account.pageId,
            instagramUserId,
            token: account.token,
            name: response.data.instagram_business_account.username || account.name,
            source: account.source
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
            const saved = credentials();
            const pages = saved.filter(
                (account) => !['Instagram', 'Threads'].includes(account.platform)
            );
            const accounts = [];
            for (const account of pages) {
                try {
                    accounts.push(await metadata(account));
                } catch (error) {
                    accounts.push({
                        id: account.id,
                        pageId: account.pageId,
                        name: account.name || `Facebook Page ${account.pageId}`,
                        platform: 'Facebook',
                        avatar: '',
                        canPublish: false,
                        status: 'needs_reconnect',
                        error: publicError(error).error,
                        source: account.source
                    });
                    continue;
                }
                try {
                    for (const [id, discovered] of discoveredAccounts)
                        if (discovered.pageId === account.pageId) discoveredAccounts.delete(id);
                    const instagram = await linkedInstagram(account);
                    if (instagram) discoveredAccounts.set(instagram.id, instagram);
                } catch (error) {
                    // Keep Facebook available when Instagram permissions are missing.
                    accounts[accounts.length - 1].instagramLinkError = publicError(error).error;
                }
            }
            const instagramAccounts = [
                ...new Map(
                    [...saved, ...discoveredAccounts.values()]
                        .filter((account) => account.platform === 'Instagram')
                        .map((account) => [account.id, account])
                ).values()
            ];
            const threadsAccounts = saved.filter((account) => account.platform === 'Threads');
            for (const account of instagramAccounts) {
                try {
                    accounts.push(await metadata(account));
                } catch (error) {
                    accounts.push({
                        id: account.id,
                        pageId: account.pageId,
                        instagramUserId: account.instagramUserId,
                        name: account.name || `Instagram ${account.instagramUserId}`,
                        platform: 'Instagram',
                        avatar: '',
                        canPublish: false,
                        status: 'needs_reconnect',
                        error: publicError(error).error,
                        source: account.source
                    });
                }
            }
            for (const account of threadsAccounts) {
                try {
                    accounts.push(await metadata(account));
                } catch (error) {
                    accounts.push({
                        id: account.id,
                        threadsUserId: account.threadsUserId,
                        name: account.name || `Threads ${account.threadsUserId}`,
                        platform: 'Threads',
                        avatar: '',
                        canPublish: false,
                        status: 'needs_reconnect',
                        error: publicError(error).error,
                        source: account.source
                    });
                }
            }
            res.json({
                accounts,
                oauthConfigured: configured(),
                threadsOauthConfigured: threadsConfigured(),
                providers: providers.map((name) => ({
                    name,
                    supported: name === 'Facebook' || name === 'Threads'
                }))
            });
        })
    );
    router.get(
        '/threads/connect',
        safe(async (req, res) => {
            if (req.actor?.role === 'editor' || req.actor?.role === 'viewer')
                throw new SocialError(403, 'Chỉ Admin/Manager được liên kết tài khoản Threads.');
            if (!threadsConfigured())
                throw new SocialError(
                    503,
                    'Cấu hình Threads App ID/Secret, SOCIAL_TOKEN_ENCRYPTION_KEY và callback HTTPS không dùng localhost trên backend trước.'
                );
            for (const [key, session] of sessions)
                if (session.expires < Date.now()) sessions.delete(key);
            if (sessions.size >= 100)
                throw new SocialError(429, 'Quá nhiều phiên liên kết. Thử lại sau.');
            const state = crypto.randomBytes(32).toString('hex');
            sessions.set(state, { expires: Date.now() + 10 * 60000, provider: 'Threads' });
            res.cookie('omni_threads', state, {
                httpOnly: true,
                sameSite: 'lax',
                secure: threadsRedirectUri().startsWith('https:'),
                maxAge: 10 * 60000,
                path: '/api/social/threads'
            });
            const query = new URLSearchParams({
                client_id: env.THREADS_APP_ID,
                redirect_uri: threadsRedirectUri(),
                scope: 'threads_basic,threads_content_publish',
                response_type: 'code',
                state
            });
            res.redirect(`https://threads.net/oauth/authorize?${query}`);
        })
    );
    router.get('/threads/callback', async (req, res) => {
        let step = 'validate_state';
        let stateFailureReason = null;
        try {
            const cookie = /(?:^|;\s*)omni_threads=([a-f0-9]{64})(?:;|$)/.exec(
                req.get('Cookie') || ''
            )?.[1];
            const session = cookie && sessions.get(cookie);
            if (!cookie) stateFailureReason = 'cookie_missing';
            else if (!session) stateFailureReason = 'session_missing';
            else if (session.provider !== 'Threads') stateFailureReason = 'provider_mismatch';
            else if (session.expires < Date.now()) stateFailureReason = 'session_expired';
            else if (req.query.state !== cookie) stateFailureReason = 'state_mismatch';
            else if (session.used) stateFailureReason = 'session_already_used';
            if (stateFailureReason)
                throw new SocialError(400, 'State OAuth Threads không hợp lệ hoặc đã hết hạn.');
            session.used = true;
            if (req.query.error || typeof req.query.code !== 'string')
                throw new SocialError(400, 'Bạn đã hủy hoặc Threads chưa cấp quyền liên kết.');
            step = 'exchange_code';
            const short = await http.post(
                `${threadsGraph()}/oauth/access_token`,
                new URLSearchParams({
                    client_id: env.THREADS_APP_ID,
                    client_secret: env.THREADS_APP_SECRET,
                    code: req.query.code,
                    grant_type: 'authorization_code',
                    redirect_uri: threadsRedirectUri()
                }).toString(),
                {
                    timeout: 15000,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            );
            step = 'exchange_long_lived_token';
            const long = await http.get(`${threadsGraph()}/access_token`, {
                timeout: 15000,
                params: {
                    grant_type: 'th_exchange_token',
                    client_secret: env.THREADS_APP_SECRET,
                    access_token: short.data.access_token
                }
            });
            const token = long.data.access_token || short.data.access_token;
            step = 'fetch_profile';
            const profile = await http.get(
                `${threadsGraph()}/me`,
                options(token, { fields: 'id,username' })
            );
            if (!/^\d+$/.test(String(profile.data.id || '')))
                throw new SocialError(502, 'Threads không trả về danh tính tài khoản hợp lệ.');
            const account = {
                id: `threads:${profile.data.id}`,
                platform: 'Threads',
                threadsUserId: String(profile.data.id),
                token,
                name: profile.data.username || `Threads ${profile.data.id}`,
                expiresAt: long.data.expires_in
                    ? Date.now() + long.data.expires_in * 1000
                    : undefined
            };
            step = 'persist_token';
            const saved = new Map(vault.read().map((item) => [item.id, item]));
            saved.set(account.id, account);
            vault.write([...saved.values()]);
            sessions.delete(cookie);
            res.clearCookie('omni_threads', { path: '/api/social/threads' });
            res.redirect(`${uiOrigin()}/#connections`);
        } catch (error) {
            const providerError = error.response?.data?.error;
            console.error('Threads OAuth callback failed', {
                step,
                stateFailureReason,
                httpStatus: Number.isInteger(error.response?.status) ? error.response.status : null,
                providerCode: Number.isInteger(providerError?.code) ? providerError.code : null,
                providerSubcode: Number.isInteger(providerError?.error_subcode)
                    ? providerError.error_subcode
                    : null,
                providerType: typeof providerError?.type === 'string' ? providerError.type : null,
                networkCode: typeof error.code === 'string' ? error.code : null,
                errorName: typeof error.name === 'string' ? error.name : null
            });
            res.redirect(
                `${uiOrigin()}/?social_error=${encodeURIComponent(publicError(error).error)}#connections`
            );
        }
    });
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
                scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
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
            const instagramScopesGranted =
                granted.has('instagram_basic') && granted.has('instagram_content_publish');
            for (let n = 0; n < 10; n++) {
                const response = await http.get(
                    `${graph()}/me/accounts`,
                    options(long.data.access_token, {
                        fields: `id,name,access_token,tasks,picture.type(large)${instagramScopesGranted ? ',instagram_business_account' : ''}`,
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
                        avatar: p.picture?.data?.url || '',
                        instagramAccount: p.instagram_business_account?.id
                            ? {
                                  id: p.instagram_business_account.id,
                                  username: p.instagram_business_account.username || ''
                              }
                            : null
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
            for (const page of selected) {
                const instagramUserId = page.instagram_business_account?.id;
                if (typeof instagramUserId === 'string' && /^\d+$/.test(instagramUserId))
                    existing.set(`instagram:${instagramUserId}`, {
                        id: `instagram:${instagramUserId}`,
                        platform: 'Instagram',
                        pageId: page.id,
                        instagramUserId,
                        token: page.access_token,
                        name: page.instagram_business_account.username || page.name
                    });
            }
            if (existing.size > 100)
                throw new SocialError(
                    400,
                    'Tối đa 50 Facebook Page và tài khoản Instagram liên kết.'
                );
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
            if (account.platform === 'Instagram')
                throw new SocialError(501, 'Chưa triển khai đọc bài Instagram.');
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
        const platform = account.platform || 'Facebook';
        if (platform === 'Threads' && text.length > 500)
            throw new SocialError(400, 'Nội dung Threads vượt giới hạn 500 ký tự.');
        if (platform === 'Instagram' && text.length > 2200)
            throw new SocialError(400, 'Chú thích Instagram vượt giới hạn 2.200 ký tự.');
        if (platform === 'Instagram' && !mediaHostingAvailable(env))
            throw new SocialError(
                503,
                'Cần cài cloudflared để tạo URL ảnh tạm, hoặc cấu hình kho media S3-compatible.'
            );
        if (account.platform === 'Instagram' && !image)
            throw new SocialError(400, 'Bài Instagram cần đính kèm ảnh JPG.');
        if (account.platform === 'Instagram' && image.mime !== 'image/jpeg')
            throw new SocialError(400, 'Instagram hiện chỉ nhận ảnh JPG.');
        if (platform === 'Threads' && image && image.mime !== 'image/jpeg')
            throw new SocialError(400, 'Threads hiện chỉ nhận ảnh JPG qua chức năng đăng này.');
        if (platform === 'Threads' && image && !mediaHostingAvailable(env))
            throw new SocialError(
                503,
                'Cần cloudflared hoặc kho media công khai để đăng ảnh Threads.'
            );
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
        let postId;
        if (platform === 'Threads') {
            const createAndPublish = async (params) => {
                const container = await http.post(
                    `${threadsGraph()}/${account.threadsUserId}/threads`,
                    null,
                    options(account.token, params)
                );
                if (!container.data.id)
                    throw new SocialError(502, 'Threads không tạo được bài viết.');
                response = await http.post(
                    `${threadsGraph()}/${account.threadsUserId}/threads_publish`,
                    null,
                    options(account.token, { creation_id: container.data.id })
                );
                postId = response.data.id;
            };
            if (image) {
                const publishImage = (imageUrl) =>
                    createAndPublish({
                        media_type: 'IMAGE',
                        image_url: imageUrl,
                        ...(text ? { text } : {})
                    });
                if (mediaStorageConfigured(env))
                    await publishImage(await putPublicMedia(env, http, image, 'Threads'));
                else await temporaryMedia(image, publishImage);
            } else {
                await createAndPublish({ media_type: 'TEXT', text });
            }
        } else if (platform === 'Instagram') {
            const publishFromUrl = async (imageUrl) => {
                const container = await http.post(
                    `${graph()}/${account.instagramUserId}/media`,
                    { image_url: imageUrl, caption: text },
                    options(account.token)
                );
                if (!container.data.id)
                    throw new SocialError(502, 'Meta không tạo được media container.');
                let status;
                for (let attempt = 0; attempt < 12; attempt++) {
                    const state = await http.get(
                        `${graph()}/${container.data.id}`,
                        options(account.token, { fields: 'status_code,status' })
                    );
                    status = state.data.status_code;
                    if (status === 'FINISHED') break;
                    if (status === 'ERROR' || status === 'EXPIRED')
                        throw new SocialError(502, 'Meta không xử lý được ảnh Instagram.');
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
                if (status !== 'FINISHED')
                    throw new SocialError(
                        502,
                        'Meta chưa xác nhận xử lý ảnh Instagram. Kiểm tra trạng thái trước khi gửi lại.'
                    );
                response = await http.post(
                    `${graph()}/${account.instagramUserId}/media_publish`,
                    { creation_id: container.data.id },
                    options(account.token)
                );
                postId = response.data.id;
            };
            if (mediaStorageConfigured(env)) {
                await publishFromUrl(await putPublicMedia(env, http, image));
            } else {
                await temporaryMedia(image, publishFromUrl);
            }
        } else if (image) {
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
        if (!postId) postId = image ? response.data.post_id : response.data.id;
        const result = {
            success: true,
            message:
                platform === 'Threads'
                    ? 'Đã đăng lên Threads thành công!'
                    : platform === 'Instagram'
                      ? 'Đã đăng lên Instagram thành công!'
                      : 'Đã đăng lên Fanpage thành công!',
            providerPostId: postId || response.data.id,
            platform,
            ...(platform === 'Facebook' ? { facebookPostId: postId || response.data.id } : {}),
            accountId: account.id,
            permalink:
                platform === 'Threads'
                    ? response.data.permalink || ''
                    : platform === 'Instagram'
                      ? ''
                      : postId
                        ? `https://www.facebook.com/${postId}`
                        : ''
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

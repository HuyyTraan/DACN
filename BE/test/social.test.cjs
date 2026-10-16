const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const axios = require('axios');
const nodeHttp = require('node:http');
const { createSocial, TokenVault, decodeImage } = require('../server/social');
const { withTemporaryPublicImage } = require('../server/instagram-media-tunnel');

async function withApi(service, run) {
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use('/api/social', service.router);
    app.post('/api/publish/facebook', service.localOnly, async (req, res) => {
        try {
            res.json(await service.publish(req.body));
        } catch (error) {
            const result = service.publicError(error);
            res.status(result.status).json(result);
        }
    });
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
        await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}
function setup(extra = {}, linkedInstagram = null) {
    const env = {
        PAGE_ID: '123',
        PAGE_ACCESS_TOKEN: 'secret-page-token',
        FACEBOOK_APP_ID: 'app',
        FACEBOOK_APP_SECRET: 'app-secret',
        SOCIAL_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
        ...extra
    };
    let entries = [];
    const calls = [];
    const http = {
        get: async (url, options) => {
            calls.push({ method: 'GET', url, options });
            if (url.endsWith('/me/permissions'))
                return {
                    data: {
                        data: [
                            'pages_show_list',
                            'pages_read_engagement',
                            'pages_manage_posts',
                            'instagram_basic',
                            'instagram_content_publish'
                        ].map((permission) => ({ permission, status: 'granted' }))
                    }
                };
            if (url.endsWith('/published_posts'))
                return {
                    data: {
                        data: [
                            {
                                id: '123_456',
                                message: 'Bài thật',
                                created_time: '2026-10-12T09:00:00+0700',
                                permalink_url: 'https://www.facebook.com/123_456'
                            }
                        ],
                        paging: {
                            next: 'https://graph.facebook.com/?access_token=never-return-this',
                            cursors: { after: 'cursor' }
                        }
                    }
                };
            if (url.endsWith('/oauth/access_token'))
                return { data: { access_token: 'user-secret' } };
            if (url.endsWith('/me/accounts'))
                return {
                    data: {
                        data: [
                            {
                                id: '123',
                                name: 'ITM',
                                access_token: 'oauth-page-secret',
                                tasks: ['CREATE_CONTENT'],
                                picture: { data: { url: 'https://example.com/avatar.png' } },
                                ...(linkedInstagram
                                    ? { instagram_business_account: linkedInstagram }
                                    : {})
                            }
                        ]
                    }
                };
            if (url.endsWith('/123') && options?.params?.fields === 'instagram_business_account')
                return { data: { instagram_business_account: linkedInstagram } };
            if (url.endsWith('/777'))
                return {
                    data: {
                        id: '777',
                        username: 'itm.ig',
                        profile_picture_url: 'https://example.com/instagram-avatar.jpg'
                    }
                };
            return {
                data: {
                    id: '123',
                    name: 'ITM',
                    picture: { data: { url: 'https://example.com/avatar.png' } }
                }
            };
        },
        post: async (url, body, options) => {
            calls.push({ method: 'POST', url, body, options });
            if (url.endsWith('/777/media')) return { data: { id: 'container-1' } };
            if (url.endsWith('/777/media_publish')) return { data: { id: 'ig-post-1' } };
            return { data: { id: '123_456', post_id: '123_456' } };
        },
        put: async (url, body, options) => {
            calls.push({ method: 'PUT', url, body, options });
            return { status: 200 };
        },
        delete: async (url, options) => {
            calls.push({ method: 'DELETE', url, options });
            return { data: { success: true } };
        }
    };
    const vault = {
        read: () => entries,
        write: (next) => {
            entries = next;
        }
    };
    return { env, http, calls, vault, service: createSocial({ env, http, vault }) };
}
test('account identities are real, expired tokens disabled and secrets never returned', async () => {
    const fixture = setup();
    await withApi(fixture.service, async (base) => {
        const response = await fetch(base + '/api/social/accounts');
        const body = await response.json();
        assert.equal(body.accounts[0].name, 'ITM');
        assert.equal(body.accounts[0].canPublish, true);
        assert.ok(body.accounts[0].avatar.startsWith('https://'));
        assert.ok(!JSON.stringify(body).includes('secret'));
        fixture.http.get = async () => {
            throw { response: { data: { error: { code: 190, message: 'secret-page-token' } } } };
        };
        const expired = await (await fetch(base + '/api/social/accounts')).json();
        assert.equal(expired.accounts[0].canPublish, false);
        assert.equal(expired.accounts[0].status, 'needs_reconnect');
        assert.ok(!JSON.stringify(expired).includes('secret-page-token'));
        fixture.http.get = async () => ({ data: { id: 'wrong-user', name: 'Personal profile' } });
        assert.equal(
            (await (await fetch(base + '/api/social/accounts')).json()).accounts[0].canPublish,
            false
        );
    });
});
test('Instagram image publishing uploads to configured S3-compatible storage then publishes a finished Meta container', async () => {
    const storage = {
        INSTAGRAM_MEDIA_ENDPOINT: 'https://storage.example.test',
        INSTAGRAM_MEDIA_BUCKET: 'public-media',
        INSTAGRAM_MEDIA_REGION: 'auto',
        INSTAGRAM_MEDIA_ACCESS_KEY: 'fake-access',
        INSTAGRAM_MEDIA_SECRET_KEY: 'fake-secret',
        INSTAGRAM_MEDIA_PUBLIC_ORIGIN: 'https://cdn.example.test'
    };
    const f = setup(storage, { id: '777', username: 'itm.ig' });
    f.vault.write([
        {
            id: 'instagram:777',
            platform: 'Instagram',
            pageId: '123',
            instagramUserId: '777',
            token: 'secret-page-token'
        }
    ]);
    f.http.get = async (url, options) => {
        f.calls.push({ method: 'GET', url, options });
        if (url.endsWith('/777')) return { data: { id: '777', username: 'itm.ig' } };
        if (url.endsWith('/container-1')) return { data: { status_code: 'FINISHED' } };
        if (url.endsWith('/123'))
            return { data: { instagram_business_account: { id: '777', username: 'itm.ig' } } };
        return { data: { id: '123', name: 'ITM' } };
    };
    const image = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 1, 2]).toString('base64');
    const result = await f.service.publish({
        accountId: 'instagram:777',
        noiDungBaiViet: 'IG mock',
        image,
        requestId: crypto.randomUUID()
    });
    assert.equal(result.platform, 'Instagram');
    assert.equal(result.providerPostId, 'ig-post-1');
    assert.equal(f.calls.filter((call) => call.method === 'PUT').length, 1);
    const container = f.calls.find((call) => call.url.endsWith('/777/media'));
    assert.equal(container.body.caption, 'IG mock');
    assert.match(container.body.image_url, /^https:\/\/cdn\.example\.test\/instagram\//);
    assert.ok(f.calls.find((call) => call.url.endsWith('/777/media_publish')));
    assert.ok(!JSON.stringify(result).includes('fake-secret'));
});
test('temporary Instagram media tunnel exposes only the one-time image path and closes it after publishing', async () => {
    const { EventEmitter } = require('node:events');
    const { PassThrough } = require('node:stream');
    const image = { buffer: Buffer.from('fake-jpeg'), mime: 'image/jpeg', extension: 'jpg' };
    let origin;
    let child;
    const result = await withTemporaryPublicImage(
        image,
        async (publicUrl) => {
            assert.match(
                publicUrl,
                /^https:\/\/test-tunnel\.trycloudflare\.com\/media\/[a-f0-9]{48}\.jpg$/
            );
            const url = new URL(publicUrl);
            const key = url.pathname;
            const response = await fetch(`${origin}${key}`);
            assert.equal(response.headers.get('content-type'), 'image/jpeg');
            assert.deepEqual(Buffer.from(await response.arrayBuffer()), image.buffer);
            assert.equal((await fetch(`${origin}/api/social/accounts`)).status, 404);
            return 'published';
        },
        {
            binaryPath: 'mock-cloudflared',
            spawnProcess: (_binary, args) => {
                origin = args[3].replace('127.0.0.1', '127.0.0.1');
                child = new EventEmitter();
                child.stdout = new PassThrough();
                child.stderr = new PassThrough();
                child.exitCode = null;
                child.kill = () => {
                    child.exitCode = 0;
                    return true;
                };
                setImmediate(() =>
                    child.stdout.write(
                        'https://test-tunnel.trycloudflare.com\nRegistered tunnel connection'
                    )
                );
                return child;
            }
        }
    );
    assert.equal(result, 'published');
    assert.equal(child.exitCode, 0);
    await assert.rejects(fetch(origin + '/media/anything.jpg'));
});
test('linked professional Instagram identity is discovered but publishing stays disabled when media hosting is explicitly off', async () => {
    const fixture = setup(
        { INSTAGRAM_MEDIA_TUNNEL_ENABLED: 'false' },
        { id: '777', username: 'itm.ig' }
    );
    await withApi(fixture.service, async (base) => {
        const body = await (await fetch(base + '/api/social/accounts')).json();
        const instagram = body.accounts.find((account) => account.platform === 'Instagram');
        assert.equal(instagram.id, 'instagram:777');
        assert.equal(instagram.name, 'itm.ig');
        assert.equal(instagram.status, 'connected');
        assert.equal(instagram.canPublish, false);
        assert.match(instagram.publishBlockedReason, /kho media công khai/);
        assert.ok(!JSON.stringify(body).includes('secret-page-token'));
        assert.equal(
            (await fetch(base + '/api/social/accounts/instagram%3A777/posts')).status,
            501
        );
        await assert.rejects(
            fixture.service.publish({
                accountId: 'instagram:777',
                noiDungBaiViet: 'Instagram test'
            }),
            (error) => error.status === 503
        );
    });
});
test('read Page posts with safe cursor; edits/deletes cannot target another Page', async () => {
    const f = setup();
    await withApi(f.service, async (base) => {
        const endpoint = base + '/api/social/accounts/facebook%3A123/posts';
        const body = await (await fetch(endpoint)).json();
        assert.equal(body.posts[0].message, 'Bài thật');
        assert.equal(body.nextCursor, 'cursor');
        assert.ok(!JSON.stringify(body).includes('access_token'));
        assert.equal((await fetch(endpoint + '?since=1791738000&until=1792342800')).status, 200);
        assert.equal(f.calls.at(-1).options.params.since, 1791738000);
        assert.equal(f.calls.at(-1).options.params.until, 1792342800);
        for (const query of [
            '?since=abc&until=123',
            '?since=123',
            '?since=456&until=123',
            '?since=0&until=4102444800'
        ])
            assert.equal((await fetch(endpoint + query)).status, 400);
        const before = f.calls.length;
        assert.equal((await fetch(endpoint + '/999_456', { method: 'DELETE' })).status, 403);
        assert.equal(f.calls.length, before);
        assert.equal(
            (
                await fetch(endpoint + '/123_456', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'Cập nhật' })
                })
            ).status,
            200
        );
        assert.equal(
            (
                await fetch(endpoint + '/123_456', {
                    method: 'DELETE',
                    headers: { Origin: 'https://evil.example' }
                })
            ).status,
            403
        );
        assert.equal((await fetch(endpoint + '/123_456', { method: 'DELETE' })).status, 200);
        assert.equal(
            (await fetch(endpoint + '?after=' + encodeURIComponent('https://evil.example'))).status,
            400
        );
    });
});
test('photo uploads use binary multipart and repeat publish is deduplicated', async () => {
    const f = setup();
    const image =
        'data:image/png;base64,' +
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]).toString('base64');
    await withApi(f.service, async (base) => {
        const payload = {
            noiDungBaiViet: 'Bài có ảnh',
            accountId: 'facebook:123',
            image,
            requestId: crypto.randomUUID()
        };
        const send = (body = payload) =>
            fetch(base + '/api/publish/facebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        assert.equal((await send()).status, 200);
        assert.equal((await send()).status, 200);
        const posts = f.calls.filter((call) => call.method === 'POST');
        assert.equal(posts.length, 1);
        assert.ok(posts[0].url.endsWith('/123/photos'));
        assert.equal(posts[0].body.get('source').type, 'image/png');
        assert.equal(posts[0].body.get('caption'), 'Bài có ảnh');
        assert.ok(!posts[0].url.includes('secret'));
        assert.equal((await send({ ...payload, noiDungBaiViet: 'Khác' })).status, 409);
        assert.equal(
            (
                await send({
                    ...payload,
                    image: 'data:image/png;base64,' + Buffer.from('<script>').toString('base64')
                })
            ).status,
            400
        );
    });
    assert.throws(() => decodeImage('data:image/svg+xml;base64,PHN2Zz4='));
    assert.throws(() =>
        decodeImage('data:image/png;base64,' + Buffer.alloc(1024 * 1024 + 1).toString('base64'))
    );
});
test('OAuth state binds browser session; selection stores linked Instagram token only on the server', async () => {
    const f = setup({}, { id: '777', username: 'itm.ig' });
    await withApi(f.service, async (base) => {
        const start = await fetch(base + '/api/social/facebook/connect', { redirect: 'manual' });
        assert.equal(start.status, 302);
        const cookie = start.headers.get('set-cookie').split(';')[0];
        const authorization = new URL(start.headers.get('location'));
        const state = authorization.searchParams.get('state');
        assert.match(authorization.searchParams.get('scope'), /instagram_basic/);
        assert.match(authorization.searchParams.get('scope'), /instagram_content_publish/);
        const bad = await fetch(base + '/api/social/facebook/callback?state=wrong&code=test', {
            headers: { Cookie: cookie },
            redirect: 'manual'
        });
        assert.ok(bad.headers.get('location').includes('social_error'));
        assert.equal(f.calls.length, 0);
        const callback = await fetch(
            base + `/api/social/facebook/callback?state=${state}&code=test`,
            { headers: { Cookie: cookie }, redirect: 'manual' }
        );
        assert.equal(callback.status, 302);
        const pages = await (
            await fetch(base + '/api/social/facebook/pages', { headers: { Cookie: cookie } })
        ).json();
        assert.equal(pages.pages[0].name, 'ITM');
        assert.equal(pages.pages[0].instagramAccount.username, 'itm.ig');
        assert.ok(!JSON.stringify(pages).includes('secret'));
        const choose = (ids) =>
            fetch(base + '/api/social/facebook/pages', {
                method: 'POST',
                headers: { Cookie: cookie, 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageIds: ids })
            });
        assert.equal((await choose(['999'])).status, 403);
        assert.equal((await choose(['123'])).status, 200);
        assert.equal(f.vault.read()[0].token, 'oauth-page-secret');
        assert.equal(f.vault.read()[1].id, 'instagram:777');
        assert.equal(f.vault.read()[1].platform, 'Instagram');
        assert.equal(f.vault.read()[1].token, 'oauth-page-secret');
        assert.equal((await choose(['123'])).status, 401);
        assert.equal(
            (
                await fetch(base + '/api/social/facebook/callback?state=' + state + '&code=test', {
                    redirect: 'manual'
                })
            ).status,
            302
        );
    });
});
test('token vault encrypts credentials and fails closed if encryption key changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-vault-'));
    const file = path.join(dir, 'tokens.enc');
    try {
        const env = { SOCIAL_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') };
        const vault = new TokenVault(env, file);
        const entries = [{ id: 'facebook:123', token: 'private-token' }];
        vault.write(entries);
        assert.ok(!fs.readFileSync(file, 'utf8').includes('private-token'));
        assert.deepEqual(vault.read(), entries);
        env.SOCIAL_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
        assert.throws(() => vault.read(), /Không thể đọc/);
    } finally {
        fs.unlinkSync(file);
        fs.rmdirSync(dir);
    }
});

test('Axios sends photo as actual multipart binary without putting token in URL', async () => {
    let received;
    const wire = nodeHttp.createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        received = {
            url: req.url,
            type: req.headers['content-type'],
            bytes: Buffer.concat(chunks)
        };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ id: 'photo', post_id: '123_999' }));
    });
    await new Promise((resolve) => wire.listen(0, '127.0.0.1', resolve));
    try {
        const f = setup();
        const adapter = {
            ...f.http,
            post: (url, body, options) =>
                axios.post(`http://127.0.0.1:${wire.address().port}/photos`, body, options)
        };
        const service = createSocial({ env: f.env, http: adapter, vault: f.vault });
        const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
        const result = await service.publish({
            noiDungBaiViet: 'Caption kiểm thử',
            image: 'data:image/png;base64,' + image.toString('base64')
        });
        assert.equal(result.facebookPostId, '123_999');
        assert.match(received.type, /^multipart\/form-data; boundary=/);
        assert.ok(received.bytes.includes(image));
        assert.ok(received.bytes.toString().includes('filename="photo.png"'));
        assert.ok(received.bytes.toString().includes('Caption kiểm thử'));
        assert.ok(!received.url.includes('secret-page-token'));
    } finally {
        await new Promise((resolve) => wire.close(resolve));
    }
});

test('OAuth declined publishing permission never creates a linked account', async () => {
    const f = setup();
    const original = f.http.get;
    f.http.get = async (url, options) =>
        url.endsWith('/me/permissions')
            ? {
                  data: {
                      data: [
                          { permission: 'pages_show_list', status: 'granted' },
                          { permission: 'pages_manage_posts', status: 'declined' }
                      ]
                  }
              }
            : original(url, options);
    await withApi(f.service, async (base) => {
        const start = await fetch(base + '/api/social/facebook/connect', { redirect: 'manual' });
        const cookie = start.headers.get('set-cookie').split(';')[0];
        const state = new URL(start.headers.get('location')).searchParams.get('state');
        const callback = await fetch(
            base + `/api/social/facebook/callback?state=${state}&code=test`,
            { headers: { Cookie: cookie }, redirect: 'manual' }
        );
        assert.ok(callback.headers.get('location').includes('social_error'));
        assert.equal(f.vault.read().length, 0);
        assert.equal(
            (
                await (
                    await fetch(base + '/api/social/facebook/pages', {
                        headers: { Cookie: cookie }
                    })
                ).json()
            ).pages.length,
            0
        );
    });
});

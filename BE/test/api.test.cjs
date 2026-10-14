const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const axios = require('axios');
process.env.DATABASE_URL = '';
// Explicit dependency injection for legacy mocked endpoints; production defaults to auth.
const app = require('../server').createApp({ authentication: false });
const { workspaceRouter, PostgresWorkspace } = require('../server/workspace');
const { seed } = require('../../FE/public/domain');

async function withServer(application, run) {
    const server = await new Promise((resolve) => {
        const instance = application.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
        await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}
test('UI, health, Swagger, Postman and safe validation endpoints', async () => {
    await withServer(app, async (base) => {
        const html = await (await fetch(base)).text();
        assert.match(html, /id="root"/);
        const bundleAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(
            (match) => match[1]
        );
        assert.ok(bundleAssets.length >= 2, 'Production HTML references JS and CSS bundles');
        for (const asset of ['/domain.js', '/brand.svg', ...bundleAssets]) {
            assert.equal((await fetch(base + asset)).status, 200, asset);
        }
        assert.equal((await fetch(base + '/api/rpa-example')).status, 200);
        assert.equal((await (await fetch(base + '/api/health')).json()).status, 'ok');
        assert.equal((await (await fetch(base + '/api/workspace')).json()).mode, 'demo');
        assert.equal((await fetch(base + '/api/docs/')).status, 200);
        assert.ok((await (await fetch(base + '/api/postman')).json()).item.length >= 4);
        assert.equal((await fetch(base + '/api/missing')).status, 404);
        for (const value of ['', ' ', 12, {}, null]) {
            const response = await fetch(base + '/api/publish/facebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ noiDungBaiViet: value })
            });
            assert.equal(response.status, 400);
        }
        assert.equal(
            (
                await fetch(base + '/api/workspace', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                })
            ).status,
            503
        );
    });
});
test('Facebook success and provider failure use a mock; no posts leave the machine', async () => {
    const previous = axios.post;
    const page = process.env.PAGE_ID;
    const token = process.env.PAGE_ACCESS_TOKEN;
    try {
        process.env.PAGE_ID = 'test-page';
        process.env.PAGE_ACCESS_TOKEN = 'fake-token';
        await withServer(app, async (base) => {
            let calls = 0;
            axios.post = async (url, body, options) => {
                calls++;
                assert.match(url, /test-page\/feed$/);
                assert.equal(options.timeout, 15000);
                return { data: { id: 'fake-post-id' } };
            };
            const request = () =>
                fetch(base + '/api/publish/facebook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ noiDungBaiViet: 'Nội dung test' })
                });
            const result = await request();
            assert.equal(result.status, 200);
            assert.equal((await result.json()).facebookPostId, 'fake-post-id');
            assert.equal(calls, 1);
            axios.post = async () => {
                throw new Error('fake-token must never be exposed');
            };
            const failed = await request();
            assert.equal(failed.status, 502);
            assert.ok(!(await failed.text()).includes('fake-token'));
            delete process.env.PAGE_ACCESS_TOKEN;
            assert.equal((await request()).status, 503);
        });
    } finally {
        axios.post = previous;
        if (page === undefined) delete process.env.PAGE_ID;
        else process.env.PAGE_ID = page;
        if (token === undefined) delete process.env.PAGE_ACCESS_TOKEN;
        else process.env.PAGE_ACCESS_TOKEN = token;
    }
});
test('PostgreSQL API handles validation, version conflicts and database failures', async () => {
    let current = { data: seed(), version: 1 };
    const store = {
        read: async () => current,
        write: async (data, version) => {
            if (version !== current.version) return undefined;
            current = { data, version: version + 1 };
            return { version: current.version };
        }
    };
    const api = express();
    api.use(express.json());
    api.use('/api/workspace', workspaceRouter(store));
    await withServer(api, async (base) => {
        const url = base + '/api/workspace';
        assert.equal((await (await fetch(url)).json()).mode, 'postgres');
        const write = (payload) =>
            fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        assert.equal((await write({ data: {}, version: 1 })).status, 400);
        const next = seed();
        next.channels[0].name = 'Kênh mới';
        assert.equal((await (await write({ data: next, version: 1 })).json()).version, 2);
        assert.equal((await write({ data: seed(), version: 1 })).status, 409);
        assert.equal((await (await fetch(url)).json()).data.channels[0].name, 'Kênh mới');
        store.read = async () => {
            throw new Error('DB connection string secret');
        };
        const error = await fetch(url);
        assert.equal(error.status, 503);
        assert.ok(!(await error.text()).includes('secret'));
    });
});
test('Postgres repository parameterizes writes and checks version atomically', async () => {
    const queries = [];
    const repository = new PostgresWorkspace({
        query: async (text, values) => {
            queries.push({ text, values });
            return { rows: text.startsWith('UPDATE') ? [{ version: 2 }] : [] };
        }
    });
    const state = seed();
    state.channels[0].name = "name'; DROP TABLE omni_workspace;--";
    await repository.write(state, 1);
    const initial = queries.find((query) => query.text.startsWith('INSERT'));
    assert.ok(Object.values(JSON.parse(initial.values[0])).every((rows) => rows.length === 0));
    const last = queries.at(-1);
    assert.ok(last.text.includes('version = $2'));
    assert.equal(last.values[1], 1);
    assert.ok(!last.text.includes('DROP TABLE'));
    assert.ok(last.values[0].includes('DROP TABLE'));
});

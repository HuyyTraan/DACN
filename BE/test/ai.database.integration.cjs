const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { Pool } = require('pg');
const { createAuth } = require('../server/auth');
const { aiAnalysisRouter } = require('../server/ai-analysis');
const { AiProviderError } = require('../server/ai-provider');

test('AI Analysis: temporary PostgreSQL schema, auth/CSRF, cache, history, failures and quota', async (t) => {
    if (!process.env.RUN_DATABASE_TESTS)
        return t.skip('RUN_DATABASE_TESTS chỉ bật với PostgreSQL test.');
    require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
    const schema = 'omni_ai_test_' + crypto.randomBytes(12).toString('hex');
    const root = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await root.query('CREATE SCHEMA ' + schema);
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: '-c search_path=' + schema,
        max: 4
    });
    let server;
    t.after(async () => {
        if (server) await new Promise((resolve) => server.close(resolve));
        await pool.end();
        assert.match(schema, /^omni_ai_test_[a-f0-9]{24}$/);
        await root.query('DROP SCHEMA ' + schema + ' CASCADE');
        await root.end();
    });
    for (const name of (await fs.readdir(path.join(__dirname, '../db/migrations')))
        .filter((name) => name.endsWith('.sql'))
        .sort())
        await pool.query(await fs.readFile(path.join(__dirname, '../db/migrations', name), 'utf8'));
    await pool.query("INSERT INTO studio_workspace(id,name) VALUES(1,'AI test only')");

    let mode = 'ok';
    let calls = 0;
    const provider = {
        configured: true,
        model: 'gemini-2.5-flash-lite',
        async generate(payload) {
            calls++;
            if (mode === 'timeout') throw new AiProviderError('Dịch vụ AI quá thời gian chờ.', 504);
            if (mode === 'bad')
                return {
                    report: {
                        summary: 'Sai',
                        findings: [{ explanation: 'Sai', factIds: ['fake'] }],
                        recommendations: [],
                        limitations: []
                    },
                    usage: { inputTokens: 100, outputTokens: 40, thoughtsTokens: 0 }
                };
            return {
                report: {
                    summary: 'Có số liệu cùng kỳ.',
                    findings: [
                        {
                            factIds: ['P1_interactionRateByReach'],
                            explanation: 'Tỷ lệ tương tác được đo.'
                        }
                    ],
                    recommendations: [],
                    limitations: []
                },
                usage: { inputTokens: 100, outputTokens: 40, thoughtsTokens: 0 }
            };
        }
    };
    const auth = createAuth({}, pool);
    const app = express();
    app.use(express.json());
    app.use('/api/auth', auth.router);
    app.use('/api', auth.middleware);
    app.use(
        '/api/ai',
        aiAnalysisRouter(pool, {
            provider,
            env: {
                AI_DAILY_REQUEST_LIMIT: '3',
                AI_GEMINI_FREE_TIER_ONLY: 'true'
            }
        })
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = (url, options = {}, identity = admin) =>
        fetch(base + url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(identity ? { Cookie: identity.cookie, 'X-CSRF-Token': identity.csrf } : {}),
                ...options.headers
            },
            ...(options.body ? { body: JSON.stringify(options.body) } : {})
        });
    const session = (response) => {
        const cookies = response.headers.getSetCookie();
        return {
            cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
            csrf: cookies
                .find((cookie) => cookie.startsWith('omni_csrf='))
                .split(';')[0]
                .split('=')[1]
        };
    };
    let admin;
    assert.equal((await request('/api/ai/status', {}, null)).status, 401);
    let response = await request(
        '/api/auth/bootstrap',
        {
            method: 'POST',
            body: {
                name: 'AI admin',
                email: 'ai-admin@example.test',
                password: 'Test password 2026!'
            }
        },
        null
    );
    assert.equal(response.status, 200);
    admin = session(response);
    response = await request('/api/ai/status');
    assert.equal(response.status, 200);
    const freeStatus = await response.json();
    assert.equal(freeStatus.freeTierOnly, true);
    assert.equal(freeStatus.providerConfigured, true);
    assert.equal(freeStatus.budgetConfigured, false);
    assert.equal(freeStatus.remainingBudgetVnd, null);
    const input = (postId) => ({
        pageId: 'page-test',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-07',
        timezone: 'Asia/Ho_Chi_Minh',
        source: 'demo',
        sourceLabel: 'Tổng hợp',
        rows: [
            {
                providerPostId: postId,
                reach: 100,
                impressions: 200,
                interactions: 10,
                linkClicks: 4
            }
        ]
    });
    assert.equal(
        (
            await request('/api/ai/imports', {
                method: 'POST',
                body: input('csrf'),
                headers: { 'X-CSRF-Token': '' }
            })
        ).status,
        403
    );
    response = await request('/api/auth/users', {
        method: 'POST',
        body: {
            name: 'AI viewer',
            email: 'ai-viewer@example.test',
            password: 'Test password 2026!',
            role: 'viewer'
        }
    });
    assert.equal(response.status, 201);
    response = await request(
        '/api/auth/login',
        {
            method: 'POST',
            body: { email: 'ai-viewer@example.test', password: 'Test password 2026!' }
        },
        null
    );
    assert.equal(response.status, 200);
    const viewer = session(response);
    assert.equal(
        (await request('/api/ai/imports', { method: 'POST', body: input('viewer') }, viewer))
            .status,
        403
    );
    response = await request('/api/ai/imports', { method: 'POST', body: input('post-1') });
    assert.equal(response.status, 201);
    const imported = await response.json();
    assert.equal(imported.kpis.interactionRateByReach.value, 10);
    assert.equal(imported.aiPayload.posts[0].text, undefined);
    assert.equal(
        (await request('/api/ai/imports', { method: 'POST', body: input('post-1') })).status,
        409
    );
    assert.equal((await request('/api/ai/imports/' + imported.import.id, {}, viewer)).status, 200);
    response = await request('/api/ai/analyses', {
        method: 'POST',
        body: { importId: imported.import.id, includeText: false }
    });
    assert.equal(response.status, 201);
    const completed = (await response.json()).analysis;
    assert.equal(completed.status, 'completed');
    assert.equal(completed.estimatedCostVnd, 0);
    assert.equal(completed.actualCostVnd, null);
    assert.equal(completed.report.findings[0].factIds[0], 'P1_interactionRateByReach');
    response = await request('/api/ai/analyses', {
        method: 'POST',
        body: { importId: imported.import.id, includeText: false }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).cached, true);
    assert.equal(calls, 1);

    const makeImport = async (id) => {
        const result = await request('/api/ai/imports', { method: 'POST', body: input(id) });
        assert.equal(result.status, 201);
        return (await result.json()).import.id;
    };
    mode = 'bad';
    const badId = await makeImport('post-bad');
    response = await request('/api/ai/analyses', {
        method: 'POST',
        body: { importId: badId, includeText: false }
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).analysis.status, 'failed');
    mode = 'timeout';
    const timeoutId = await makeImport('post-timeout');
    response = await request('/api/ai/analyses', {
        method: 'POST',
        body: { importId: timeoutId, includeText: false }
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).analysis.kpis.linkCTR.value, 2);
    const missing = input('post-missing');
    missing.rows[0] = { providerPostId: 'post-missing' };
    response = await request('/api/ai/imports', { method: 'POST', body: missing });
    assert.equal(response.status, 201);
    const missingId = (await response.json()).import.id;
    assert.equal(
        (
            await request('/api/ai/analyses', {
                method: 'POST',
                body: { importId: missingId, includeText: false }
            })
        ).status,
        422
    );
    mode = 'ok';
    const quotaId = await makeImport('post-quota');
    assert.equal(
        (
            await request('/api/ai/analyses', {
                method: 'POST',
                body: { importId: quotaId, includeText: false }
            })
        ).status,
        429
    );
    response = await request('/api/ai/analyses?limit=10', {}, viewer);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).total, 3);
    response = await request('/api/ai/analyses/' + completed.id, {}, viewer);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).analysis.report.summary, 'Có số liệu cùng kỳ.');
});

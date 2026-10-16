const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { createAuth } = require('../server/auth');
const { resourceRouter } = require('../server/resources');
const { workspaceRouter, PostgresWorkspace } = require('../server/workspace');
const {
    PublishingRepository,
    publishingRouter,
    runOnce,
    validatePlan
} = require('../server/publishing');
const { emptyWorkspace, seed } = require('../../FE/public/domain');
const { publishDurably } = require('../server/publish-receipts');
const { scanApprovalReminders } = require('../server/automation');
test('real PostgreSQL: migrations, auth/RBAC/CSRF, history and restart persistence', async (t) => {
    if (!process.env.RUN_DATABASE_TESTS) {
        t.skip('Chạy npm run test:database để bật test PostgreSQL riêng.');
        return;
    }
    require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
    const schema = 'omni_test_' + crypto.randomBytes(12).toString('hex');
    const root = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await root.query('CREATE SCHEMA ' + schema);
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: '-c search_path=' + schema,
        max: 4
    });
    const prismaUrl = new URL(process.env.DATABASE_URL);
    prismaUrl.searchParams.set('schema', schema);
    const prisma = new PrismaClient({
        datasources: { db: { url: prismaUrl.toString() } },
        log: []
    });
    let server;
    t.after(async () => {
        if (server) await new Promise((r) => server.close(r));
        await prisma.$disconnect();
        await pool.end();
        assert.match(schema, /^omni_test_[a-f0-9]{24}$/);
        await root.query('DROP SCHEMA ' + schema + ' CASCADE');
        await root.end();
    });
    for (const name of (await fs.readdir(path.join(__dirname, '../db/migrations')))
        .filter((n) => n.endsWith('.sql'))
        .sort()) {
        const sql = await fs.readFile(path.join(__dirname, '../db/migrations', name), 'utf8');
        await pool.query(sql);
    }
    await pool.query("INSERT INTO studio_workspace(id,name) VALUES(1,'Test only')");
    const store = new PostgresWorkspace(pool);
    await store.init();
    const social = {
        localOnly: (req, res, next) => next(),
        hasAccount: () => true,
        publish: async () => ({ facebookPostId: 'test-page_test-post' }),
        publicError: () => ({ status: 502, error: 'Unknown' })
    };
    const auth = createAuth({}, pool),
        repo = new PublishingRepository(pool);
    async function start() {
        const app = express();
        app.use(express.json({ limit: '5mb' }));
        app.use('/api/auth', auth.router);
        app.use('/api', auth.middleware);
        app.use('/api/workspace', workspaceRouter(store));
        app.use('/api/publishing', publishingRouter({ repository: repo, social }));
        app.use('/api', resourceRouter(pool, auth, prisma));
        server = app.listen(0, '127.0.0.1');
        await new Promise((r) => server.once('listening', r));
        return 'http://127.0.0.1:' + server.address().port;
    }
    let base = await start(),
        admin,
        viewer;
    async function request(url, options = {}, identity = admin) {
        return fetch(base + url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(identity ? { Cookie: identity.cookie, 'X-CSRF-Token': identity.csrf } : {}),
                ...options.headers
            },
            ...(options.body ? { body: JSON.stringify(options.body) } : {})
        });
    }
    function session(response) {
        const lines = response.headers.getSetCookie();
        return {
            cookie: lines.map((s) => s.split(';')[0]).join('; '),
            csrf: lines
                .find((s) => s.startsWith('omni_csrf='))
                .split(';')[0]
                .split('=')[1]
        };
    }
    assert.equal((await request('/api/workspace', {}, null)).status, 401);
    let response = await request(
        '/api/auth/bootstrap',
        {
            method: 'POST',
            body: {
                name: 'Test administrator',
                email: 'admin@example.com',
                password: 'Test password 2026!'
            }
        },
        null
    );
    assert.equal(response.status, 200);
    admin = session(response);
    assert.equal(
        (
            await request(
                '/api/auth/bootstrap',
                {
                    method: 'POST',
                    body: {
                        name: 'Intruder',
                        email: 'a@example.test',
                        password: 'Test password 2026!'
                    }
                },
                null
            )
        ).status,
        409
    );
    response = await request('/api/workspace');
    const initial = await response.json();
    assert.equal(initial.mode, 'postgres');
    // Factory fixtures are confined to this disposable schema, never runtime/user data.
    const data = seed();
    data.rankChecks = [
        {
            id: 'rank-request',
            name: 'Stored SERP request',
            url: 'example.test',
            platform: 'Google',
            region: 'Việt Nam',
            date: '2026-10-13',
            status: 'Chờ kết nối SERP',
            rank: 0
        }
    ];
    data.campaigns = [
        {
            id: 'persistent-campaign',
            name: 'Persistence test',
            platform: 'Facebook',
            owner: 'Test',
            status: 'Bản nháp',
            start: '2026-10-13',
            end: '2026-12-31',
            budget: 1000,
            spent: 0,
            reach: 0,
            leads: 0
        }
    ];
    assert.equal(
        (
            await request('/api/workspace', {
                method: 'PUT',
                body: { data, version: 1 },
                headers: { 'X-CSRF-Token': 'wrong' }
            })
        ).status,
        403
    );
    response = await request('/api/workspace', { method: 'PUT', body: { data, version: 1 } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).version, 2);
    assert.equal(
        (await request('/api/workspace', { method: 'PUT', body: { data, version: 1 } })).status,
        409
    );
    const budget = await pool.query('SELECT budget FROM studio_campaigns WHERE id=$1', [
        'persistent-campaign'
    ]);
    assert.equal(Number(budget.rows[0].budget), 1000);
    for (const [key, table] of Object.entries(require('../server/catalog').collections))
        assert.equal(
            (
                await pool.query(
                    'SELECT count(*)::int AS n FROM ' + table + ' WHERE deleted_at IS NULL'
                )
            ).rows[0].n,
            data[key].length
        );
    assert.ok((await pool.query('SELECT count(*)::int AS n FROM studio_messages')).rows[0].n > 0);
    response = await request('/api/auth/users', {
        method: 'POST',
        body: {
            name: 'Viewer',
            email: 'viewer@example.test',
            password: 'Test viewer password!',
            role: 'viewer'
        }
    });
    assert.equal(response.status, 201);
    response = await request(
        '/api/auth/login',
        {
            method: 'POST',
            body: { email: 'viewer@example.test', password: 'Test viewer password!' }
        },
        null
    );
    viewer = session(response);
    assert.equal((await request('/api/auth/users', {}, viewer)).status, 403);
    assert.equal(
        (await request('/api/workspace', { method: 'PUT', body: { data, version: 2 } }, viewer))
            .status,
        403
    );
    assert.equal(
        (
            await request(
                '/api/records/workflows',
                { method: 'POST', body: { record: { name: 'Not allowed' } } },
                viewer
            )
        ).status,
        403
    );
    response = await request('/api/records/workflows', {
        method: 'POST',
        body: { record: { name: 'Persistent workflow', status: 'draft', steps: ['review'] } }
    });
    assert.equal(response.status, 201);
    assert.equal(
        (
            await request('/api/records/settings', {
                method: 'POST',
                body: { record: { name: 'Do not store tokens', access_token: 'secret' } }
            })
        ).status,
        400
    );
    assert.equal(
        (
            await request('/api/records/metrics', {
                method: 'POST',
                body: { record: { name: 'Invalid metric', reach: -1 } }
            })
        ).status,
        400
    );
    assert.equal(
        (
            await request('/api/records/metrics', {
                method: 'POST',
                body: { record: { name: 'Unknown post', postId: 'does-not-exist' } }
            })
        ).status,
        400
    );
    response = await request('/api/auth/users', {
        method: 'POST',
        body: {
            name: 'Review manager',
            email: 'manager@example.com',
            password: 'Test manager password!',
            role: 'manager'
        }
    });
    assert.equal(response.status, 201);
    response = await request('/api/auth/users', {
        method: 'POST',
        body: {
            name: 'Editor',
            email: 'editor@example.test',
            password: 'Test editor password!',
            role: 'editor'
        }
    });
    assert.equal(response.status, 201);
    response = await request(
        '/api/auth/login',
        {
            method: 'POST',
            body: { email: 'editor@example.test', password: 'Test editor password!' }
        },
        null
    );
    const editor = session(response);
    const pendingBody = {
        name: 'Approval expiry test',
        status: 'pending',
        accountIds: ['facebook:123'],
        items: [
            { content: 'Only publish after approval', kind: 'post', delayMinutes: 0, image: '' }
        ],
        timezone: 'Asia/Ho_Chi_Minh',
        repeat: 'none',
        repeatCount: 1,
        scheduledAt: new Date(Date.now() + 7200000).toISOString()
    };
    response = await request(
        '/api/publishing/plans',
        {
            method: 'POST',
            body: {
                ...pendingBody,
                scheduledAt: new Date(Date.now() + 59 * 60000).toISOString()
            }
        },
        editor
    );
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /ít nhất 1 giờ/);
    response = await request(
        '/api/publishing/plans',
        { method: 'POST', body: pendingBody },
        editor
    );
    assert.equal(response.status, 201);
    const waiting = await response.json();
    response = await request(
        `/api/publishing/plans/${waiting.id}`,
        {
            method: 'PUT',
            body: {
                ...pendingBody,
                scheduledAt: new Date(Date.now() + 59 * 60000).toISOString(),
                version: waiting.version
            }
        },
        editor
    );
    assert.equal(response.status, 403);
    assert.equal(
        (await repo.list()).plans.find((p) => p.id === waiting.id).version,
        waiting.version
    );
    const approvalMail = await pool.query(
        "SELECT recipient_email,status FROM studio_automation_messages WHERE plan_id=$1 AND kind='approval_requested' ORDER BY recipient_email",
        [waiting.id]
    );
    assert.deepEqual(approvalMail.rows, [
        { recipient_email: 'admin@example.com', status: 'queued' },
        { recipient_email: 'manager@example.com', status: 'queued' }
    ]);
    response = await request(
        '/api/auth/login',
        {
            method: 'POST',
            body: { email: 'manager@example.com', password: 'Test manager password!' }
        },
        null
    );
    const manager = session(response);
    response = await request('/api/publishing/plans', {
        method: 'POST',
        body: { ...pendingBody, name: 'Admin deletion test', status: 'scheduled' }
    });
    assert.equal(response.status, 201);
    const toDelete = await response.json();
    const deleteUrl = `/api/publishing/plans/${toDelete.id}`;
    for (const identity of [manager, editor]) {
        assert.equal(
            (
                await request(
                    deleteUrl,
                    { method: 'DELETE', body: { version: toDelete.version } },
                    identity
                )
            ).status,
            403
        );
    }
    assert.equal(
        (await request(deleteUrl, { method: 'DELETE', body: { version: toDelete.version + 1 } }))
            .status,
        409
    );
    assert.equal(
        (await request(deleteUrl, { method: 'DELETE', body: { version: '1' } })).status,
        400
    );
    await pool.query(
        "UPDATE publishing_deliveries SET status='published',provider_post_id='page_external-post' WHERE plan_id=$1",
        [toDelete.id]
    );
    response = await request(deleteUrl, { method: 'DELETE', body: { version: toDelete.version } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: toDelete.id, deleted: true });
    for (const [table, column] of [
        ['publishing_plans', 'id'],
        ['publishing_deliveries', 'plan_id'],
        ['studio_plan_history', 'plan_id'],
        ['studio_automation_messages', 'plan_id']
    ]) {
        assert.equal(
            (
                await pool.query(`SELECT count(*)::int n FROM ${table} WHERE ${column}=$1`, [
                    toDelete.id
                ])
            ).rows[0].n,
            0
        );
    }
    assert.equal(
        (
            await pool.query(
                "SELECT count(*)::int n FROM studio_delivery_history WHERE provider_post_id='page_external-post'"
            )
        ).rows[0].n,
        0
    );
    assert.equal(
        (
            await pool.query(
                "SELECT count(*)::int n FROM studio_audit WHERE entity_id=$1 AND action='approval.deleted'",
                [toDelete.id]
            )
        ).rows[0].n,
        1
    );
    assert.equal(
        (await request(deleteUrl, { method: 'DELETE', body: { version: toDelete.version } }))
            .status,
        404
    );
    response = await request('/api/publishing/plans', {
        method: 'POST',
        body: { ...pendingBody, name: 'Active delivery deletion guard', status: 'scheduled' }
    });
    const activePlan = await response.json();
    await pool.query("UPDATE publishing_deliveries SET status='running' WHERE plan_id=$1", [
        activePlan.id
    ]);
    assert.equal(
        (
            await request(`/api/publishing/plans/${activePlan.id}`, {
                method: 'DELETE',
                body: { version: activePlan.version }
            })
        ).status,
        409
    );
    assert.equal(
        (
            await pool.query('SELECT count(*)::int n FROM publishing_plans WHERE id=$1', [
                activePlan.id
            ])
        ).rows[0].n,
        1
    );
    await pool.query("UPDATE publishing_deliveries SET status='cancelled' WHERE plan_id=$1", [
        activePlan.id
    ]);
    assert.equal(
        (
            await request(`/api/publishing/plans/${activePlan.id}`, {
                method: 'DELETE',
                body: { version: activePlan.version }
            })
        ).status,
        200
    );
    response = await request('/api/publishing/approvals?status=pending&limit=5');
    assert.equal(response.status, 200);
    let approvalList = await response.json();
    assert.ok(approvalList.items.some((item) => item.id === waiting.id));
    assert.ok(approvalList.counts.pending >= 1);
    response = await request(
        '/api/publishing/plans',
        {
            method: 'POST',
            body: { ...pendingBody, name: 'Rejected review test' }
        },
        editor
    );
    assert.equal(response.status, 201);
    const toReject = await response.json();
    assert.equal(
        (
            await request(
                `/api/publishing/plans/${toReject.id}/reject`,
                {
                    method: 'POST',
                    body: { version: toReject.version, reason: 'Cần sửa nội dung' }
                },
                editor
            )
        ).status,
        403
    );
    assert.equal(
        (
            await request(`/api/publishing/plans/${toReject.id}/reject`, {
                method: 'POST',
                body: { version: toReject.version, reason: '' }
            })
        ).status,
        400
    );
    response = await request(`/api/publishing/plans/${toReject.id}/reject`, {
        method: 'POST',
        body: { version: toReject.version, reason: 'Cần sửa nội dung' }
    });
    assert.equal(response.status, 200);
    assert.equal(
        (
            await request(`/api/publishing/plans/${toReject.id}/reject`, {
                method: 'POST',
                body: { version: toReject.version, reason: 'Lặp lại' }
            })
        ).status,
        409
    );
    response = await request('/api/publishing/approvals?status=rejected');
    approvalList = await response.json();
    const rejectedReview = approvalList.items.find((item) => item.id === toReject.id);
    assert.equal(rejectedReview.rejectionReason, 'Cần sửa nội dung');
    assert.equal(rejectedReview.reviewedByName, 'Test administrator');
    assert.ok(rejectedReview.reviewedAt);
    assert.equal(
        (
            await pool.query('SELECT count(*)::int n FROM publishing_deliveries WHERE plan_id=$1', [
                toReject.id
            ])
        ).rows[0].n,
        0
    );
    response = await request(
        `/api/publishing/plans/${toReject.id}`,
        {
            method: 'PUT',
            body: { ...pendingBody, version: rejectedReview.version }
        },
        editor
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'pending');
    response = await request('/api/publishing/approvals?status=pending');
    approvalList = await response.json();
    assert.equal(approvalList.items.find((item) => item.id === toReject.id).reviewedByName, null);
    assert.equal(await scanApprovalReminders(pool), 4);
    assert.equal(await scanApprovalReminders(pool), 0);
    assert.equal(
        (
            await pool.query('SELECT count(*)::int n FROM publishing_deliveries WHERE plan_id=$1', [
                waiting.id
            ])
        ).rows[0].n,
        0
    );
    assert.equal(
        (
            await request(
                `/api/publishing/plans/${waiting.id}/approve`,
                { method: 'POST', body: { version: waiting.version } },
                editor
            )
        ).status,
        403
    );
    await repo.expirePending(Date.now() + 7200000);
    const expired = (await repo.list()).plans.find((p) => p.id === waiting.id);
    assert.equal(expired.status, 'cancelled');
    assert.match(expired.cancellationReason, /chưa được duyệt/);
    assert.equal(
        (
            await request(`/api/publishing/plans/${waiting.id}/approve`, {
                method: 'POST',
                body: { version: expired.version }
            })
        ).status,
        409
    );
    assert.equal(
        (
            await request(`/api/publishing/plans/${waiting.id}`, {
                method: 'PUT',
                body: { ...pendingBody, status: 'scheduled', version: expired.version }
            })
        ).status,
        409
    );
    assert.equal(
        (
            await request(
                `/api/publishing/plans/${waiting.id}`,
                {
                    method: 'PUT',
                    body: {
                        ...pendingBody,
                        scheduledAt: '2000-01-01T00:00:00Z',
                        version: expired.version
                    }
                },
                editor
            )
        ).status,
        400
    );
    response = await request(
        `/api/publishing/plans/${waiting.id}`,
        { method: 'PUT', body: { ...pendingBody, version: expired.version } },
        editor
    );
    assert.equal(response.status, 200);
    const submitted = await response.json();
    response = await request(`/api/publishing/plans/${waiting.id}/approve`, {
        method: 'POST',
        body: { version: submitted.version }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'scheduled');
    assert.equal(
        (
            await pool.query('SELECT count(*)::int n FROM publishing_deliveries WHERE plan_id=$1', [
                waiting.id
            ])
        ).rows[0].n,
        1
    );
    await repo.expirePending(Date.now() + 7200000);
    assert.equal((await repo.list()).plans.find((p) => p.id === waiting.id).status, 'scheduled');
    const approved = (await repo.list()).plans.find((p) => p.id === waiting.id);
    const cancelled = await repo.cancel(waiting.id, approved.version);
    const resent = await repo.write(waiting.id, validatePlan(pendingBody), cancelled.version);
    await repo.write(
        waiting.id,
        validatePlan({ ...pendingBody, status: 'scheduled' }),
        resent.version
    );
    assert.equal((await repo.list()).plans.find((p) => p.id === waiting.id).deliveries.length, 1);
    assert.equal(
        (
            await pool.query('SELECT count(*)::int n FROM publishing_deliveries WHERE plan_id=$1', [
                waiting.id
            ])
        ).rows[0].n,
        2
    );
    assert.equal(
        (
            await request(`/api/publishing/plans/${waiting.id}/approve`, {
                method: 'POST',
                body: { version: submitted.version }
            })
        ).status,
        409
    );
    response = await request('/api/publishing/plans', {
        method: 'POST',
        body: {
            name: 'Test schedule',
            accountIds: ['facebook:123'],
            status: 'scheduled',
            items: [{ content: 'Mock only', image: '', kind: 'post', delayMinutes: 0 }],
            timezone: 'Asia/Ho_Chi_Minh',
            scheduledAt: new Date(Date.now() + 3600000).toISOString(),
            repeat: 'none',
            repeatCount: 1
        }
    });
    assert.equal(response.status, 201);
    const plan = await response.json();
    const actor = (await pool.query("SELECT id,role FROM studio_users WHERE role='admin'")).rows[0];
    await pool.query(
        "INSERT INTO studio_social_accounts(id,workspace_id,name,platform,status,payload) VALUES('facebook:123',1,'Mock only','Facebook','connected',$1)",
        [
            JSON.stringify({
                id: 'facebook:123',
                name: 'Mock only',
                platform: 'Facebook',
                status: 'connected'
            })
        ]
    );
    const manualBody = {
        name: 'Manual publish test',
        accountIds: ['facebook:123'],
        status: 'scheduled',
        items: [{ content: 'Manual publish, mock only', image: '', kind: 'post', delayMinutes: 0 }],
        timezone: 'Asia/Ho_Chi_Minh',
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        repeat: 'none',
        repeatCount: 1
    };
    response = await request('/api/publishing/plans', { method: 'POST', body: manualBody });
    assert.equal(response.status, 201);
    const manualPlan = await response.json();
    const manualDelivery = (await repo.list()).plans.find((p) => p.id === manualPlan.id)
        .deliveries[0];
    const manualUrl = `/api/publishing/plans/${manualPlan.id}/deliveries/${manualDelivery.id}/publish-now`;
    let manualCalls = 0;
    const originalPublish = social.publish;
    social.publish = async (body) => {
        manualCalls++;
        assert.equal(body.requestId, manualDelivery.id);
        return { facebookPostId: 'test-page_manual-post' };
    };
    assert.equal(
        (
            await request(
                manualUrl,
                { method: 'POST', body: { version: manualPlan.version } },
                editor
            )
        ).status,
        403
    );
    assert.equal(
        (await request(manualUrl, { method: 'POST', body: { version: manualPlan.version + 1 } }))
            .status,
        409
    );
    response = await request(manualUrl, { method: 'POST', body: { version: manualPlan.version } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        deliveryId: manualDelivery.id,
        status: 'published',
        providerPostId: 'test-page_manual-post'
    });
    assert.equal(
        (await request(manualUrl, { method: 'POST', body: { version: manualPlan.version } }))
            .status,
        409
    );
    assert.equal(manualCalls, 1);
    assert.equal(
        (
            await pool.query('SELECT status FROM publishing_deliveries WHERE id=$1', [
                manualDelivery.id
            ])
        ).rows[0].status,
        'published'
    );
    social.publish = originalPublish;
    const featureRecords = {
        workflowRuns: { status: 'pending' },
        metrics: { accountId: 'facebook:123', postId: data.posts[0].id, reach: 100, clicks: 5 },
        traffic: { customerId: data.customers[0].id, visits: 1 },
        reports: { type: 'content' },
        media: { description: 'Metadata fixture' },
        notifications: { userId: actor.id, message: 'Internal fixture' },
        settings: { key: 'timezone', value: 'Asia/Ho_Chi_Minh' },
        tags: { color: '#8874e6' },
        approvals: { postId: data.posts[0].id, status: 'pending' }
    };
    for (const [key, record] of Object.entries(featureRecords)) {
        const r = await request('/api/records/' + key, {
            method: 'POST',
            body: { record: { name: 'Fixture ' + key, ...record } }
        });
        assert.equal(r.status, 201, key);
        assert.equal((await request('/api/records/' + key)).status, 200, key);
    }
    assert.equal(
        (
            await request('/api/records/socialAccounts', {
                method: 'POST',
                body: { record: { name: 'Fake connection' } }
            })
        ).status,
        403
    );
    assert.equal((await request('/api/records/__proto__')).status, 404);
    const receiptBody = {
        accountId: 'facebook:123',
        noiDungBaiViet: 'Mock receipt only',
        requestId: crypto.randomUUID()
    };
    let receiptCalls = 0;
    const receiptSocial = {
        ...social,
        publish: async () => {
            receiptCalls++;
            return { facebookPostId: 'test-page_receipt' };
        }
    };
    assert.equal(
        (await publishDurably(pool, receiptSocial, receiptBody, actor)).facebookPostId,
        'test-page_receipt'
    );
    // Simulated due clock in the isolated test schema only; Meta is mocked.
    await pool.query(
        "UPDATE publishing_deliveries SET due_at=now()-interval '1 second' WHERE plan_id=$1",
        [plan.id]
    );
    assert.equal(await runOnce(repo, social), true);
    await new Promise((r) => server.close(r));
    server = null;
    base = await start();
    assert.equal(
        (await publishDurably(pool, receiptSocial, receiptBody, actor)).facebookPostId,
        'test-page_receipt'
    );
    assert.equal(receiptCalls, 1);
    await assert.rejects(
        () =>
            publishDurably(
                pool,
                receiptSocial,
                { ...receiptBody, noiDungBaiViet: 'Changed' },
                actor
            ),
        (e) => e.status === 409
    );
    assert.ok(
        (await pool.query('SELECT count(*)::int AS n FROM studio_plan_history')).rows[0].n > 0
    );
    response = await request('/api/workspace');
    assert.deepEqual((await response.json()).data.campaigns, data.campaigns);
    assert.equal((await request('/api/records/workflows')).status, 200);
    const persisted = await (await request('/api/publishing/plans')).json();
    assert.equal(
        (
            await request(
                '/api/publishing/plans',
                {
                    method: 'POST',
                    body: {
                        name: 'Forbidden schedule',
                        accountIds: ['facebook:123'],
                        status: 'scheduled',
                        items: [{ content: 'Mock only', image: '', kind: 'post', delayMinutes: 0 }],
                        timezone: 'UTC',
                        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
                        repeat: 'none',
                        repeatCount: 1
                    }
                },
                editor
            )
        ).status,
        403
    );
    const workerPlan = persisted.plans.find((p) => p.id === plan.id);
    assert.equal(workerPlan.deliveries[0].status, 'published');
    assert.equal(workerPlan.deliveries[0].provider_post_id, 'test-page_test-post');
    const publishedReview = (
        await (await request('/api/publishing/approvals?status=scheduled')).json()
    ).items.find((item) => item.id === plan.id);
    assert.equal(publishedReview.publishedCount, 1);
    assert.equal(publishedReview.isLocked, true);
    assert.ok(
        (await pool.query('SELECT count(*)::int AS n FROM studio_delivery_history')).rows[0].n >= 3
    );
    const history = await (await request('/api/history')).json();
    assert.ok(
        history.events.some(
            (e) => e.entity === 'publishing_plans' && e.action === 'approval.rejected'
        )
    );
    assert.ok(
        (
            await pool.query(
                "SELECT 1 FROM studio_audit WHERE entity='campaigns' AND action='create' LIMIT 1"
            )
        ).rows.length
    );
    const snapshots = await (await request('/api/snapshots')).json();
    assert.ok(snapshots.snapshots.length > 0);
    const beforeDelete = await (await request('/api/workspace')).json();
    response = await request('/api/records/campaigns/persistent-campaign', {
        method: 'DELETE',
        body: { version: beforeDelete.version }
    });
    assert.equal(response.status, 200);
    assert.ok(
        (
            await pool.query('SELECT deleted_at FROM studio_campaigns WHERE id=$1', [
                'persistent-campaign'
            ])
        ).rows[0].deleted_at
    );
    const restore = (await (await request('/api/snapshots')).json()).snapshots.find(
        (s) => s.version === 2
    );
    const beforeRestore = await (await request('/api/workspace')).json();
    assert.equal(
        (
            await request('/api/snapshots/' + restore.id + '/restore', {
                method: 'POST',
                body: { version: beforeRestore.version }
            })
        ).status,
        200
    );
    assert.deepEqual(
        (await (await request('/api/workspace')).json()).data.campaigns,
        data.campaigns
    );
    const users = await (await request('/api/auth/users')).json();
    const me = users.users.find((u) => u.role === 'admin');
    const viewerUser = users.users.find((u) => u.role === 'viewer');
    assert.equal(
        (
            await request(
                '/api/auth/users/' + viewerUser.id + '/password',
                {
                    method: 'POST',
                    body: {
                        password: 'Reset viewer password!',
                        adminPassword: 'Test password 2026!'
                    }
                },
                viewer
            )
        ).status,
        403
    );
    assert.equal(
        (
            await request('/api/auth/users/' + viewerUser.id + '/password', {
                method: 'POST',
                body: { password: 'Reset viewer password!', adminPassword: 'Test password 2026!' }
            })
        ).status,
        200
    );
    assert.equal((await request('/api/workspace', {}, viewer)).status, 401);
    assert.equal(
        (
            await request('/api/auth/users/' + me.id, {
                method: 'PATCH',
                body: { role: 'viewer', active: false }
            })
        ).status,
        409
    );
    const missedPlan = await repo.write(
        crypto.randomUUID(),
        validatePlan({
            ...pendingBody,
            status: 'scheduled',
            scheduledAt: new Date(Date.now() + 3600000).toISOString()
        }),
        null,
        actor
    );
    const missedDue = Date.parse(missedPlan.scheduledAt);
    await repo.expireScheduled(missedDue + 119999);
    assert.equal((await repo.list()).plans.find((p) => p.id === missedPlan.id).status, 'scheduled');
    assert.ok((await repo.expireScheduled(missedDue + 120001)) >= 1);
    const missed = (await repo.list()).plans.find((p) => p.id === missedPlan.id);
    assert.equal(missed.status, 'cancelled');
    assert.match(missed.cancellationReason, /chưa được đăng/);
    assert.equal(missed.deliveries[0].status, 'cancelled');
    assert.equal(await repo.claim(), null);
    assert.equal(
        (
            await pool.query(
                "SELECT count(*)::int n FROM studio_plan_history WHERE plan_id=$1 AND status='cancelled'",
                [missedPlan.id]
            )
        ).rows[0].n,
        1
    );
    const sentAgain = await repo.write(
        missedPlan.id,
        validatePlan({ ...pendingBody, scheduledAt: new Date(Date.now() + 7200000).toISOString() }),
        missed.version,
        actor
    );
    assert.equal(sentAgain.status, 'pending');
    assert.equal(
        (
            await pool.query('SELECT count(*)::int n FROM publishing_deliveries WHERE plan_id=$1', [
                missedPlan.id
            ])
        ).rows[0].n,
        1
    );
    const repeating = await repo.write(
        crypto.randomUUID(),
        validatePlan({
            ...pendingBody,
            status: 'scheduled',
            repeat: 'daily',
            repeatCount: 2,
            scheduledAt: new Date(Date.now() + 10800000).toISOString()
        }),
        null,
        actor
    );
    await repo.expireScheduled(Date.parse(repeating.scheduledAt) + 120001);
    const remainingPlan = (await repo.list()).plans.find((p) => p.id === repeating.id);
    assert.equal(remainingPlan.status, 'scheduled');
    assert.deepEqual(
        remainingPlan.deliveries.map((d) => d.status),
        ['cancelled', 'queued']
    );
    response = await request('/api/auth/logout', { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal((await request('/api/workspace')).status, 401);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
    validatePlan,
    deliveriesFor,
    PublishingRepository,
    publishingRouter,
    runOnce
} = require('../server/publishing');
const { expiredWorkspacePost } = require('../server/approval-expiry');
const plan = () => ({
    name: 'Kế hoạch ITM',
    status: 'scheduled',
    accountIds: ['facebook:123', 'facebook:456'],
    items: [
        { content: 'Bài chính', kind: 'post', delayMinutes: 0, image: '' },
        { content: 'Bài sau', kind: 'post', delayMinutes: 60, image: '' }
    ],
    timezone: 'Asia/Ho_Chi_Minh',
    repeat: 'daily',
    repeatCount: 2,
    scheduledAt: '2099-01-01T02:00:00Z'
});
test('create writes delivery matrix in one transaction; replay cannot enqueue duplicates', async () => {
    const normalized = validatePlan(plan()),
        statements = [];
    let inserted = false;
    const client = {
        query: async (sql, args) => {
            statements.push({ sql, args });
            if (sql.startsWith('INSERT INTO publishing_plans')) {
                if (inserted) return { rows: [] };
                inserted = true;
                return { rows: [{ version: 1 }] };
            }
            if (sql.startsWith('SELECT version, payload'))
                return { rows: [{ version: 1, payload: normalized, status: 'scheduled' }] };
            return { rows: [] };
        },
        release() {}
    };
    const repo = new PublishingRepository({ connect: async () => client });
    await repo.write('same-id', normalized, null);
    await repo.write('same-id', normalized, null);
    const writes = statements.filter((s) => s.sql.startsWith('INSERT INTO publishing_deliveries'));
    assert.equal(writes.length, 1);
    assert.equal(JSON.parse(writes[0].args[0]).length, 8);
    assert.equal(statements.filter((s) => s.sql === 'COMMIT').length, 2);
});
test('publishing validates accounts, series, recurrence, media and rejects unsupported replies', () => {
    assert.equal(validatePlan(plan()).name, 'Kế hoạch ITM');
    assert.equal(validatePlan({ ...plan(), name: '' }).name, 'Bài chính');
    assert.equal(validatePlan({ ...plan(), name: undefined }).name, 'Bài chính');
    assert.throws(
        () => validatePlan({ ...plan(), name: 123 }),
        (e) => e.status === 400
    );
    for (const change of [
        { accountIds: ['instagram:123'] },
        { accountIds: ['facebook:123', 'facebook:123'] },
        { repeatCount: 31 },
        { timezone: 'Invalid/Zone' },
        { scheduledAt: '2000-01-01' },
        { items: [] }
    ])
        assert.throws(
            () => validatePlan({ ...plan(), ...change }),
            (e) => e.status === 400
        );
    assert.throws(
        () =>
            validatePlan({
                ...plan(),
                items: [
                    {
                        content: 'A',
                        kind: 'post',
                        delayMinutes: 0,
                        image: 'data:image/png;base64,c2VjcmV0'
                    }
                ]
            }),
        (e) => e.status === 400
    );
    const reply = {
        ...plan(),
        items: [plan().items[0], { content: 'Reply', kind: 'reply', delayMinutes: 60 }]
    };
    assert.throws(
        () => validatePlan(reply),
        (e) => e.status === 422
    );
    assert.equal(validatePlan({ ...reply, status: 'draft' }).items[1].kind, 'reply');
    assert.equal(validatePlan({ ...plan(), token: 'secret' }).token, undefined);
});
test('delivery matrix uses UTC instants, account isolation and serial delays across recurrence', () => {
    const rows = deliveriesFor(validatePlan(plan()), 'id');
    assert.equal(rows.length, 8);
    assert.equal(new Set(rows.map((r) => r.id)).size, 8);
    assert.equal(rows[0].dueAt, '2099-01-01T02:00:00.000Z');
    assert.equal(rows[1].dueAt, '2099-01-01T03:00:00.000Z');
    assert.equal(rows[4].dueAt, '2099-01-02T02:00:00.000Z');
    assert.deepEqual(deliveriesFor({ ...plan(), status: 'draft' }, 'id'), []);
});
test('repository updates are atomic and stale versions roll back without deleting deliveries', async () => {
    const statements = [];
    const client = {
        query: async (sql, args) => {
            statements.push({ sql, args });
            if (sql.startsWith('SELECT version')) return { rows: [{ version: 3 }] };
            return { rows: [] };
        },
        release() {}
    };
    const repo = new PublishingRepository({ connect: async () => client });
    await assert.rejects(repo.write('id', validatePlan(plan()), 2), (e) => e.status === 409);
    assert.equal(statements.at(-1).sql, 'ROLLBACK');
    assert.ok(!statements.some((s) => s.sql.startsWith('DELETE')));
    assert.deepEqual(statements[1].args, ['id']);
});
test('claim serializes with cancellation and skips locked jobs; interrupted jobs are never retried', async () => {
    const statements = [];
    const client = {
        query: async (sql) => {
            statements.push(sql);
            return { rows: [] };
        },
        release() {}
    };
    const repo = new PublishingRepository({ connect: async () => client });
    assert.equal(await repo.claim(), null);
    assert.ok(statements.some((sql) => sql.includes('FOR UPDATE OF p, d SKIP LOCKED')));
    assert.ok(statements.some((sql) => sql.includes("d.due_at > now() - interval '2 minutes'")));
    assert.ok(statements.some((sql) => sql.includes("status = 'unknown'")));
    assert.equal(statements.at(-1), 'COMMIT');
});
test('workspace expires missed approved posts without cancelling known publish outcomes', () => {
    const now = Date.parse('2026-10-13T06:00:00Z');
    const base = {
        status: 'Đã lên lịch',
        date: '2026-10-13',
        time: '12:00',
        timezone: 'Asia/Ho_Chi_Minh'
    };
    assert.match(expiredWorkspacePost(base, now), /chưa được đăng/);
    assert.equal(expiredWorkspacePost({ ...base, time: '14:00' }, now), null);
    assert.equal(expiredWorkspacePost({ ...base, facebookPostId: 'page_post' }, now), null);
    assert.equal(
        expiredWorkspacePost({ ...base, publishResults: [{ status: 'unknown' }] }, now),
        null
    );
    assert.match(expiredWorkspacePost({ ...base, status: 'Chờ duyệt' }, now), /chưa được duyệt/);
});
test('worker stores per-target provider IDs and stops uncertain outcomes without retry', async () => {
    const delivery = { id: 'fake-job', account_id: 'facebook:123', item_index: 0, payload: plan() };
    const finishes = [];
    let calls = 0;
    const repo = { claim: async () => delivery, finish: async (...args) => finishes.push(args) };
    const social = {
        publish: async (body) => {
            calls++;
            assert.equal(body.accountId, 'facebook:123');
            return { facebookPostId: '123_999' };
        },
        publicError: () => ({ status: 502, error: 'Kết quả chưa rõ' })
    };
    await runOnce(repo, social);
    assert.equal(finishes[0][1], 'published');
    assert.equal(finishes[0][2], '123_999');
    social.publish = async () => {
        calls++;
        throw new Error('secret transport failure');
    };
    await runOnce(repo, social);
    assert.equal(finishes[1][1], 'unknown');
    assert.equal(finishes[1][3], 'Kết quả chưa rõ');
    assert.equal(calls, 2);
});
test('publishing HTTP returns 201, safe errors, pagination and versioned cancellation', async (t) => {
    const app = express();
    app.use(express.json());
    let saved;
    const repo = {
        pool: { query: async () => ({ rows: [] }) },
        expirePending: async () => repo.pool.query('SELECT id FROM publishing_plans LIMIT 1'),
        expireScheduled: async () => 0,
        list: async () => ({ plans: [], nextOffset: null }),
        write: async (id, p) => {
            saved = p;
            return { id, version: 1, ...p };
        },
        cancel: async () => ({ version: 2 })
    };
    app.use(
        '/api/publishing',
        publishingRouter({
            repository: repo,
            social: {
                localOnly: (req, res, next) => next(),
                hasAccount: (id) => id === 'facebook:123'
            }
        })
    );
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}/api/publishing`;
    let response = await fetch(base + '/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...plan(), accountIds: ['facebook:123'] })
    });
    assert.equal(response.status, 201);
    assert.match(response.headers.get('location'), /plans/);
    assert.equal(saved.items.length, 2);
    response = await fetch(base + '/plans?limit=200');
    assert.equal(response.status, 400);
    response = await fetch(base + '/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan())
    });
    assert.equal(response.status, 403);
    response = await fetch(base + '/plans/11111111-1111-4111-8111-111111111111/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1 })
    });
    assert.equal(response.status, 200);
    repo.pool.query = async () => {
        throw Object.assign(new Error('password secret@internal-host'), { code: '28P01' });
    };
    response = await fetch(base + '/status');
    const unavailable = await response.json();
    assert.equal(unavailable.ready, false);
    assert.match(unavailable.error, /đăng nhập PostgreSQL/);
    assert.ok(!JSON.stringify(unavailable).includes('secret'));
    repo.list = repo.pool.query;
    response = await fetch(base + '/plans');
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /đăng nhập PostgreSQL/);
});

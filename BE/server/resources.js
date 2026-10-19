const express = require('express');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { collections, resources } = require('./catalog');
const { readRecords, writeRecords, safePayload, audit } = require('./data-store');
const { decodeImage } = require('./social');
function resourceRouter(pool, auth, prisma = null) {
    const router = express.Router();
    const handle = (fn) => async (req, res) => {
        try {
            if (!pool) throw Object.assign(new Error('Cần PostgreSQL.'), { status: 503 });
            await fn(req, res);
        } catch (e) {
            res.status(e.status || 503).json({
                error: e.status
                    ? e.message
                    : 'Không thể truy cập dữ liệu. Kiểm tra kết nối/migration.'
            });
        }
    };
    const fail = (status, message) => {
        throw Object.assign(new Error(message), { status });
    };
    router.get(
        '/history',
        handle(async (req, res) => {
            const before = String(req.query.before || '9223372036854775807');
            if (!/^\d{1,19}$/.test(before)) fail(400, 'Cursor không hợp lệ.');
            const rows = (
                await pool.query(
                    'SELECT a.id,a.actor_id,u.name AS actor_name,a.action,a.entity,a.entity_id,a.created_at FROM studio_audit a LEFT JOIN studio_users u ON u.id=a.actor_id WHERE a.workspace_id=1 AND a.id<$1::bigint ORDER BY a.id DESC LIMIT 51',
                    [before]
                )
            ).rows;
            res.json({
                events: rows.slice(0, 50),
                nextCursor: rows.length > 50 ? rows[49].id : null
            });
        })
    );
    router.get(
        '/history/:id',
        auth.allow(['admin', 'manager']),
        handle(async (req, res) => {
            if (!/^\d{1,19}$/.test(req.params.id)) fail(400, 'ID không hợp lệ.');
            const row = (
                await pool.query('SELECT * FROM studio_audit WHERE workspace_id=1 AND id=$1', [
                    req.params.id
                ])
            ).rows[0];
            if (!row) fail(404, 'Không tìm thấy hoạt động.');
            res.json(row);
        })
    );
    router.get(
        '/snapshots',
        auth.allow(['admin', 'manager']),
        handle(async (req, res) =>
            res.json({
                snapshots: (
                    await pool.query(
                        'SELECT id,version,created_at FROM studio_snapshot_history WHERE workspace_id=1 ORDER BY id DESC LIMIT 100'
                    )
                ).rows
            })
        )
    );
    router.post(
        '/snapshots/:id/restore',
        auth.allow(['admin']),
        handle(async (req, res) => {
            if (!/^\d{1,19}$/.test(req.params.id) || !Number.isInteger(req.body?.version))
                fail(400, 'ID/phiên bản không hợp lệ.');
            const row = (
                await pool.query(
                    'SELECT data FROM studio_snapshot_history WHERE workspace_id=1 AND id=$1',
                    [req.params.id]
                )
            ).rows[0];
            if (!row) fail(404, 'Không tìm thấy bản sao.');
            const result = await writeRecords(pool, row.data, req.body.version, req.actor);
            if (!result) fail(409, 'Dữ liệu đã thay đổi. Tải lại trước khi khôi phục.');
            await audit(pool, req.actor, 'restore', 'workspace', req.params.id, null, null);
            res.json(result);
        })
    );
    router.get(
        '/dashboard',
        handle(async (req, res) => {
            const period = req.query.period || 'month';
            if (!['week', 'month'].includes(period)) fail(400, 'Khoảng thời gian không hợp lệ.');
            const days = period === 'week' ? 7 : 30;
            const [d, planCounts, deliveries, pending, upcoming, recordedMetrics] =
                await Promise.all([
                    readRecords(pool),
                    pool.query(
                        'SELECT status,count(*)::int AS total FROM publishing_plans GROUP BY status'
                    ),
                    pool.query(
                        `SELECT count(*) FILTER (WHERE d.status='queued' AND p.status='scheduled' AND d.plan_version=p.version AND d.due_at>=now() AND d.due_at<now()+interval '7 days')::int AS upcoming,
                                count(*) FILTER (WHERE d.status='published' AND d.finished_at>=now()-$1::int*interval '1 day')::int AS published,
                                count(*) FILTER (WHERE d.plan_version=p.version AND d.status IN ('failed','unknown'))::int AS attention
                         FROM publishing_deliveries d
                         JOIN publishing_plans p ON p.id=d.plan_id`,
                        [days]
                    ),
                    pool.query(
                        `SELECT id,payload->>'name' AS name,payload->>'scheduledAt' AS scheduled_at
                         FROM publishing_plans WHERE status='pending'
                         ORDER BY (payload->>'scheduledAt')::timestamptz,id LIMIT 5`
                    ),
                    pool.query(
                        `SELECT d.id,d.plan_id,d.account_id,d.due_at,p.payload->>'name' AS name
                         FROM publishing_deliveries d JOIN publishing_plans p ON p.id=d.plan_id
                         WHERE p.status='scheduled' AND d.plan_version=p.version AND d.status='queued'
                           AND d.due_at>=now() AND d.due_at<now()+interval '7 days'
                         ORDER BY d.due_at,d.id LIMIT 5`
                    ),
                    pool.query(
                        'SELECT payload,created_at FROM studio_metrics WHERE workspace_id=1 AND deleted_at IS NULL'
                    )
                ]);
            const cutoff = Date.now() - days * 86400000;
            const metrics = recordedMetrics.rows
                .filter((row) => {
                    const measuredAt = Date.parse(row.payload.measuredAt || row.created_at);
                    return (
                        Number.isFinite(measuredAt) &&
                        measuredAt >= cutoff &&
                        measuredAt <= Date.now()
                    );
                })
                .reduce(
                    (totals, row) => {
                        totals.records++;
                        for (const key of ['reach', 'clicks', 'spend'])
                            totals[key] += Number(row.payload[key]) || 0;
                        return totals;
                    },
                    { records: 0, reach: 0, clicks: 0, spend: 0 }
                );
            const count = (status) =>
                planCounts.rows.find((row) => row.status === status)?.total || 0;
            res.json({
                counts: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.length])),
                budget: d.campaigns.reduce((a, b) => a + b.budget, 0),
                spent: d.campaigns.reduce((a, b) => a + b.spent, 0),
                period,
                metrics,
                publishing: {
                    pending: count('pending'),
                    rejected: count('rejected'),
                    scheduled: count('scheduled'),
                    upcoming: deliveries.rows[0].upcoming,
                    published: deliveries.rows[0].published,
                    attention: deliveries.rows[0].attention,
                    pendingItems: pending.rows,
                    upcomingItems: upcoming.rows
                },
                source: 'postgres',
                externalAnalyticsConnected: false
            });
        })
    );
    router.get(
        '/records/:collection',
        handle(async (req, res) => {
            const key = req.params.collection,
                table = collections[key] || resources[key];
            if (!table) fail(404, 'Loại dữ liệu không tồn tại.');
            const limit = Number(req.query.limit || 100),
                offset = Number(req.query.offset || 0);
            if (
                !Number.isInteger(limit) ||
                limit < 1 ||
                limit > 1000 ||
                !Number.isInteger(offset) ||
                offset < 0
            )
                fail(400, 'Phân trang không hợp lệ.');
            const deleted = req.query.deleted === 'true' && req.actor.role === 'admin';
            const rows = prisma
                ? await prisma[table].findMany({
                      where: { workspace_id: 1, ...(deleted ? {} : { deleted_at: null }) },
                      select: { payload: true, version: true, deleted_at: true },
                      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
                      take: limit + 1,
                      skip: offset
                  })
                : (
                      await pool.query(
                          `SELECT payload,version,deleted_at FROM ${table} WHERE workspace_id=1 ${deleted ? '' : 'AND deleted_at IS NULL'} ORDER BY created_at,id LIMIT $1 OFFSET $2`,
                          [limit + 1, offset]
                      )
                  ).rows;
            const version = (await pool.query('SELECT version FROM omni_workspace WHERE id=1'))
                .rows[0].version;
            res.json({
                items: rows.slice(0, limit).map((r) => ({
                    ...r.payload,
                    recordVersion: r.version,
                    deletedAt: r.deleted_at
                })),
                version,
                nextOffset: rows.length > limit ? offset + limit : null
            });
        })
    );
    async function coreWrite(req, res, deleted = false) {
        const key = req.params.collection,
            table = collections[key] || resources[key];
        if (!table) fail(404, 'Loại dữ liệu không tồn tại.');
        if (
            req.actor.role === 'editor' &&
            [
                'accounts',
                'channels',
                'socialAccounts',
                'settings',
                'metrics',
                'traffic',
                'reports',
                'workflows',
                'workflowRuns',
                'approvals'
            ].includes(key)
        )
            fail(403, 'Chỉ người quản lý được thay đổi mục này.');
        const id = req.params.id || crypto.randomUUID();
        if (id.length > 100 || !id) fail(400, 'ID không hợp lệ.');
        if (key === 'socialAccounts')
            fail(
                403,
                'Danh tính mạng xã hội chỉ được cập nhật qua adapter xác minh. Dùng màn hình Liên kết tài khoản.'
            );
        if (collections[key]) {
            if (!Number.isInteger(req.body?.version))
                fail(400, 'Cần phiên bản workspace hiện tại.');
            const data = await readRecords(pool);
            const prior = data[key].find((r) => r.id === id);
            if (req.params.id && !prior) fail(404, 'Không tìm thấy bản ghi.');
            if (deleted) data[key] = data[key].filter((r) => r.id !== id);
            else {
                const row = { ...req.body.record, id };
                if (prior) data[key] = data[key].map((r) => (r.id === id ? row : r));
                else data[key].push(row);
            }
            const result = await writeRecords(pool, data, req.body.version, req.actor);
            if (!result) fail(409, 'Dữ liệu đã thay đổi. Tải lại trước khi lưu.');
            res.status(req.params.id ? 200 : 201).json({ id, ...result });
            return;
        }
        const db = await pool.connect();
        try {
            await db.query('BEGIN');
            const prior = (
                await db.query(
                    `SELECT payload,version FROM ${table} WHERE workspace_id=1 AND id=$1 FOR UPDATE`,
                    [id]
                )
            ).rows[0];
            if (req.params.id && (!prior || req.body?.version !== prior.version))
                fail(
                    prior ? 409 : 404,
                    prior ? 'Bản ghi đã thay đổi. Tải lại.' : 'Không tìm thấy bản ghi.'
                );
            if (deleted)
                await db.query(
                    `UPDATE ${table} SET deleted_at=now(),updated_at=now(),version=version+1 WHERE workspace_id=1 AND id=$1`,
                    [id]
                );
            else {
                const row = { ...req.body?.record, id };
                if (key === 'metrics' && !row.measuredAt) row.measuredAt = new Date().toISOString();
                if (key === 'traffic' && !row.occurredAt) row.occurredAt = new Date().toISOString();
                if (
                    typeof row.name !== 'string' ||
                    !row.name.trim() ||
                    row.name.length > 180 ||
                    JSON.stringify(row).length > 1500000 ||
                    !isDeepStrictEqual(row, safePayload(row))
                )
                    fail(400, 'Dữ liệu không hợp lệ. Không lưu credential trong bản ghi.');
                if (key === 'media' && row.image) decodeImage(row.image);
                if (
                    key === 'settings' &&
                    /pass|secret|token|api.?key|credential|database.?url/i.test(row.key || row.name)
                )
                    fail(
                        400,
                        'Credential phải được cấu hình ở backend, không lưu trong mục Cấu hình.'
                    );
                if (typeof row.url === 'string' && row.url.startsWith('http')) {
                    let u;
                    try {
                        u = new URL(row.url);
                    } catch {
                        fail(400, 'URL không hợp lệ.');
                    }
                    if (u.username || u.password) fail(400, 'Không lưu URL có credential.');
                }
                for (const field of key === 'metrics' || key === 'traffic'
                    ? [
                          'reach',
                          'impressions',
                          'clicks',
                          'interactions',
                          'spend',
                          'visits',
                          ...(key === 'traffic' ? ['value'] : [])
                      ]
                    : [])
                    if (
                        row[field] !== undefined &&
                        (!Number.isFinite(row[field]) || row[field] < 0)
                    )
                        fail(400, 'Chỉ số phải là số không âm.');
                if (
                    row.platform !== undefined &&
                    (typeof row.platform !== 'string' || row.platform.length > 40)
                )
                    fail(400, 'Nền tảng không hợp lệ.');
                if (
                    row.status !== undefined &&
                    (typeof row.status !== 'string' || row.status.length > 80)
                )
                    fail(400, 'Trạng thái không hợp lệ.');
                if (['socialAccounts', 'workflows'].includes(key) && row.status === 'connected')
                    fail(400, 'Trạng thái kết nối phải do adapter xác minh.');
                await db.query(
                    `INSERT INTO ${table}(id,workspace_id,name,platform,status,payload) VALUES($1,1,$2,$3,$4,$5::jsonb) ON CONFLICT(workspace_id,id) DO UPDATE SET name=EXCLUDED.name,platform=EXCLUDED.platform,status=EXCLUDED.status,payload=EXCLUDED.payload,version=${table}.version+1,updated_at=now(),deleted_at=NULL`,
                    [id, row.name, row.platform || '', row.status || 'draft', JSON.stringify(row)]
                );
                const relationFields =
                    {
                        workflowRuns: { workflow_id: row.workflowId },
                        metrics: { account_id: row.accountId, post_id: row.postId },
                        traffic: { customer_id: row.customerId },
                        approvals: { post_id: row.postId },
                        notifications: { user_id: row.userId }
                    }[key] || {};
                const relations = Object.entries(relationFields);
                if (relations.length)
                    await db.query(
                        `UPDATE ${table} SET ${relations.map(([field], i) => `${field}=$${i + 2}`).join(',')} WHERE workspace_id=1 AND id=$1`,
                        [id, ...relations.map(([, v]) => v || null)]
                    );
            }
            await audit(
                db,
                req.actor,
                deleted ? 'delete' : prior ? 'update' : 'create',
                key,
                id,
                prior?.payload,
                deleted ? null : req.body.record
            );
            await db.query('COMMIT');
            res.status(req.params.id ? 200 : 201).json({ id, version: (prior?.version || 0) + 1 });
        } catch (e) {
            await db.query('ROLLBACK');
            if (e.code === '23503') fail(400, 'Bản ghi được tham chiếu không tồn tại.');
            throw e;
        } finally {
            db.release();
        }
    }
    router.post(
        '/records/:collection',
        auth.allow(['admin', 'manager', 'editor']),
        handle((req, res) => coreWrite(req, res))
    );
    router.put(
        '/records/:collection/:id',
        auth.allow(['admin', 'manager', 'editor']),
        handle((req, res) => coreWrite(req, res))
    );
    router.delete(
        '/records/:collection/:id',
        auth.allow(['admin', 'manager', 'editor']),
        handle((req, res) => coreWrite(req, res, true))
    );
    return router;
}
module.exports = { resourceRouter };

const { isDeepStrictEqual } = require('node:util');
const { collections, resources } = require('./catalog');
const { emptyWorkspace, validWorkspace } = require('../../FE/public/domain');
const crypto = require('node:crypto');
const { decodeImage } = require('./social');

function safePayload(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(safePayload);
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !/password|token|secret|connectionstring|database_url/i.test(key))
            .map(([key, v]) => [key, safePayload(v)])
    );
}
async function audit(db, actor, action, entity, id, before, after) {
    await db.query(
        'INSERT INTO studio_audit(workspace_id,actor_id,action,entity,entity_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5::jsonb,$6::jsonb)',
        [
            actor?.id || null,
            action,
            entity,
            id || null,
            before ? JSON.stringify(safePayload(before)) : null,
            after ? JSON.stringify(safePayload(after)) : null
        ]
    );
}
async function synchronize(db, previous, next, actor, backfill = false) {
    for (const [key, table] of Object.entries(collections)) {
        const old = new Map((previous[key] || []).map((r) => [r.id, r]));
        for (const row of next[key] || []) {
            const prior = old.get(row.id);
            old.delete(row.id);
            if (isDeepStrictEqual(prior, row)) continue;
            const payload = safePayload(row);
            await db.query(
                `INSERT INTO ${table}(id,workspace_id,name,platform,status,payload) VALUES($1,1,$2,$3,$4,$5::jsonb) ON CONFLICT(workspace_id,id) ${backfill ? 'DO NOTHING' : 'DO UPDATE SET name=EXCLUDED.name, platform=EXCLUDED.platform,status=EXCLUDED.status,payload=EXCLUDED.payload,version=' + table + '.version+1,updated_at=now(),deleted_at=NULL'}`,
                [
                    row.id,
                    row.name,
                    row.platform,
                    row.status || row.lead || '',
                    JSON.stringify(payload)
                ]
            );
            const fields =
                {
                    accounts: { email: row.email, owner_name: row.owner },
                    channels: { url: row.url, owner_name: row.owner, followers: row.followers },
                    campaigns: {
                        owner_name: row.owner,
                        budget: row.budget,
                        spent: row.spent,
                        starts_on: /^\d{4}-\d{2}-\d{2}$/.test(row.start || '') ? row.start : null,
                        ends_on: /^\d{4}-\d{2}-\d{2}$/.test(row.end || '') ? row.end : null
                    },
                    posts: { content: row.content },
                    ads: { budget: row.budget, spent: row.spent, clicks: row.clicks },
                    customers: { email: row.email, source: row.source, visits: row.visits },
                    keywords: {
                        url: row.url,
                        rank: row.rank,
                        previous_rank: row.previous,
                        search_volume: row.volume
                    },
                    competitors: {
                        url: row.url,
                        traffic: row.traffic,
                        keyword_count: row.keywords,
                        score: row.score
                    },
                    rankChecks: { url: row.url, region: row.region, rank: row.rank }
                }[key] || {};
            const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
            if (entries.length)
                await db.query(
                    `UPDATE ${table} SET ${entries.map(([k], i) => `${k}=$${i + 2}`).join(',')} WHERE workspace_id=1 AND id=$1`,
                    [row.id, ...entries.map(([, v]) => v)]
                );
            if (['posts', 'ads'].includes(key))
                await db.query(
                    `UPDATE ${table} SET campaign_id=(SELECT id FROM studio_campaigns WHERE workspace_id=1 AND name=$2 AND deleted_at IS NULL LIMIT 1) WHERE workspace_id=1 AND id=$1`,
                    [row.id, row.campaign || '']
                );
            if (key === 'posts') {
                await db.query(
                    'DELETE FROM studio_post_items WHERE workspace_id=1 AND post_id=$1',
                    [row.id]
                );
                const items = [
                    { text: row.content, kind: 'post', image: row.image },
                    ...(row.comments || [])
                ];
                for (let i = 0; i < items.length; i++)
                    await db.query(
                        'INSERT INTO studio_post_items(workspace_id,post_id,item_index,kind,content,delay_minutes,image_data) VALUES(1,$1,$2,$3,$4,$5,$6)',
                        [
                            row.id,
                            i,
                            items[i].kind || 'reply',
                            items[i].text || '',
                            i ? Math.max(0, (parseInt(items[i].delay) || 0) * 60) : 0,
                            items[i].image || null
                        ]
                    );
            }
            if (key === 'conversations') {
                await db.query(
                    'UPDATE studio_conversations SET customer_id=$2 WHERE workspace_id=1 AND id=$1',
                    [row.id, row.customerId || null]
                );
                await db.query(
                    'DELETE FROM studio_messages WHERE workspace_id=1 AND conversation_id=$1',
                    [row.id]
                );
                for (let i = 0; i < (row.messages || []).length; i++) {
                    const m = row.messages[i];
                    await db.query(
                        'INSERT INTO studio_messages(workspace_id,conversation_id,message_index,sender,content,sent_label) VALUES(1,$1,$2,$3,$4,$5)',
                        [row.id, i, m.from, m.text, m.time]
                    );
                }
            }
            if (!backfill)
                await audit(db, actor, prior ? 'update' : 'create', key, row.id, prior, payload);
        }
        if (!backfill)
            for (const [id, prior] of old) {
                await db.query(
                    `UPDATE ${table} SET deleted_at=now(),updated_at=now(),version=version+1 WHERE workspace_id=1 AND id=$1 AND deleted_at IS NULL`,
                    [id]
                );
                await audit(db, actor, 'delete', key, id, prior, null);
            }
    }
}
async function readRecords(db) {
    const data = emptyWorkspace();
    for (const [key, table] of Object.entries(collections)) {
        const result = await db.query(
            `SELECT payload FROM ${table} WHERE workspace_id=1 AND deleted_at IS NULL ORDER BY created_at,id`
        );
        data[key] = result.rows.map((r) => r.payload);
    }
    return data;
}
async function writeRecords(pool, data, version, actor) {
    if (!isDeepStrictEqual(data, safePayload(data)))
        throw Object.assign(new Error('Không lưu mật khẩu/token trong dữ liệu workspace.'), {
            status: 400
        });
    if (!validWorkspace(data))
        throw Object.assign(new Error('Dữ liệu không gian không hợp lệ.'), { status: 400 });
    const validDate = (value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
        new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    for (const row of data.campaigns)
        if (
            (row.start && !validDate(row.start)) ||
            (row.end && !validDate(row.end)) ||
            (row.start && row.end && row.end < row.start)
        )
            throw Object.assign(new Error('Ngày chiến dịch không hợp lệ.'), { status: 400 });
    for (const row of data.posts) {
        if (!validDate(row.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time))
            throw Object.assign(new Error('Ngày giờ bài viết không hợp lệ.'), { status: 400 });
        for (const image of [row.image, ...row.comments.map((c) => c.image)])
            if (image) decodeImage(image);
    }
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const prior = await db.query(
            'SELECT data,version FROM omni_workspace WHERE id=1 FOR UPDATE'
        );
        if (!prior.rows[0] || prior.rows[0].version !== version) {
            await db.query('ROLLBACK');
            return null;
        }
        const previous = await readRecords(db);
        // Editors may draft content but cannot schedule, publish or edit connected identities.
        if (actor?.role === 'editor') {
            for (const key of ['accounts', 'channels'])
                if (!isDeepStrictEqual(previous[key], data[key]))
                    throw Object.assign(new Error('Bạn không có quyền thay đổi tài khoản/kênh.'), {
                        status: 403
                    });
            const byId = new Map(previous.posts.map((p) => [p.id, p]));
            for (const row of data.posts)
                if (
                    !isDeepStrictEqual(byId.get(row.id), row) &&
                    !['Bản nháp', 'Chờ duyệt'].includes(row.status)
                )
                    throw Object.assign(
                        new Error('Vai trò biên tập chỉ được lưu nháp hoặc gửi duyệt.'),
                        { status: 403 }
                    );
            for (const row of previous.posts)
                if (
                    !['Bản nháp', 'Chờ duyệt'].includes(row.status) &&
                    !(
                        row.status === 'Đã hủy' &&
                        data.posts.find((p) => p.id === row.id)?.status === 'Chờ duyệt'
                    ) &&
                    !isDeepStrictEqual(
                        data.posts.find((p) => p.id === row.id),
                        row
                    )
                )
                    throw Object.assign(
                        new Error('Chỉ người quản lý được thay đổi bài đã lên lịch/đã đăng.'),
                        { status: 403 }
                    );
        }
        await db.query(
            'INSERT INTO studio_snapshot_history(workspace_id,version,data,actor_id) VALUES(1,$1,$2::jsonb,$3) ON CONFLICT DO NOTHING',
            [version, JSON.stringify(safePayload(previous)), actor?.id || null]
        );
        await synchronize(db, previous, data, actor);
        const result = await db.query(
            'UPDATE omni_workspace SET data=$1::jsonb,version=version+1,updated_at=now() WHERE id=1 RETURNING version',
            [JSON.stringify(safePayload(data))]
        );
        await db.query('COMMIT');
        return result.rows[0];
    } catch (e) {
        await db.query('ROLLBACK');
        throw e;
    } finally {
        db.release();
    }
}
module.exports = { safePayload, audit, synchronize, readRecords, writeRecords };

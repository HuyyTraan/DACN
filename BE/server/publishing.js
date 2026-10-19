const express = require('express');
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { decodeImage } = require('./social');
const { postTitle } = require('../../FE/public/domain');
const { audit } = require('./data-store');
const { expireWorkspace } = require('./approval-expiry');
class PublishingError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function storageError(error) {
    if (['28P01', '28000'].includes(error?.code))
        return 'Không thể đăng nhập PostgreSQL. Kiểm tra tài khoản và mật khẩu trong BE/.env rồi khởi động lại backend.';
    if (error?.code === '3D000')
        return 'Không tìm thấy database. Kiểm tra tên database trong DATABASE_URL.';
    if (error?.code === '42P01')
        return 'Chưa có bảng kế hoạch. Chạy npm run db:migrate sau khi kết nối PostgreSQL.';
    return 'Không thể truy cập dữ liệu kế hoạch. Kiểm tra PostgreSQL và migration.';
}
function validatePlan(body, now = Date.now()) {
    const bad = (message) => {
        throw new PublishingError(400, message);
    };
    if (
        !body ||
        typeof body !== 'object' ||
        (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 180))
    )
        bad('Tên kế hoạch phải là văn bản, tối đa 180 ký tự.');
    if (
        body.tag !== undefined &&
        (typeof body.tag !== 'string' || body.tag.length > 50 || /[\r\n]/.test(body.tag))
    )
        bad('Nhãn kế hoạch phải là một dòng văn bản, tối đa 50 ký tự.');
    if (!['draft', 'pending', 'scheduled'].includes(body.status))
        bad('Trạng thái kế hoạch không hợp lệ.');
    if (
        !Array.isArray(body.accountIds) ||
        body.accountIds.length > 20 ||
        new Set(body.accountIds).size !== body.accountIds.length ||
        !body.accountIds.every((id) => typeof id === 'string' && /^facebook:[0-9]+$/.test(id))
    )
        bad('Chỉ hỗ trợ tối đa 20 Facebook Page khác nhau đã kết nối.');
    if (body.status !== 'draft' && !body.accountIds.length)
        bad('Chọn tài khoản để gửi duyệt/lên lịch.');
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 10)
        bad('Kế hoạch cần 1–10 nội dung.');
    const items = body.items.map((item, i) => {
        if (
            !item ||
            typeof item.content !== 'string' ||
            !item.content.trim() ||
            item.content.length > 63206 ||
            !['post', 'reply'].includes(item.kind) ||
            !Number.isInteger(item.delayMinutes) ||
            item.delayMinutes < 0 ||
            item.delayMinutes > 10080 ||
            (i === 0 && (item.kind !== 'post' || item.delayMinutes !== 0))
        )
            bad('Nội dung, loại bài hoặc thời gian nối tiếp không hợp lệ.');
        if (item.image) {
            try {
                decodeImage(item.image);
            } catch {
                bad('Ảnh không hợp lệ hoặc vượt 1 MB.');
            }
        }
        if (body.status !== 'draft' && item.kind === 'reply')
            throw new PublishingError(
                422,
                'Reply/bình luận chỉ lưu bản soạn; adapter chưa hỗ trợ tự đăng reply.'
            );
        return {
            content: item.content,
            image: item.image || '',
            kind: item.kind,
            delayMinutes: item.delayMinutes
        };
    });
    if (!['Asia/Ho_Chi_Minh', 'Asia/Singapore', 'UTC'].includes(body.timezone))
        bad('Múi giờ chưa được hỗ trợ.');
    if (!['none', 'daily', 'weekly'].includes(body.repeat)) bad('Quy tắc lặp không hợp lệ.');
    const repeatCount = body.repeat === 'none' ? 1 : body.repeatCount;
    if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 30)
        bad('Số lượt lặp phải từ 1 đến 30.');
    const start = Date.parse(body.scheduledAt);
    if (body.status !== 'draft' && (!Number.isFinite(start) || start <= now))
        bad('Thời gian đăng phải ở tương lai.');
    return {
        name: postTitle(body.name, items[0].content),
        tag: (body.tag || '').trim(),
        accountIds: body.accountIds,
        items,
        timezone: body.timezone,
        repeat: body.repeat,
        repeatCount,
        scheduledAt: Number.isFinite(start) ? new Date(start).toISOString() : null,
        status: body.status
    };
}
function deliveriesFor(plan, planId) {
    if (plan.status !== 'scheduled') return [];
    const interval =
        plan.repeat === 'weekly' ? 7 * 86400000 : plan.repeat === 'daily' ? 86400000 : 0;
    const rows = [];
    for (let occurrence = 0; occurrence < plan.repeatCount; occurrence++) {
        for (const accountId of plan.accountIds) {
            let due = Date.parse(plan.scheduledAt) + occurrence * interval;
            plan.items.forEach((item, index) => {
                due += item.delayMinutes * 60000;
                rows.push({
                    id: randomUUID(),
                    planId,
                    accountId,
                    index,
                    occurrence,
                    dueAt: new Date(due).toISOString()
                });
            });
        }
    }
    return rows;
}
class PublishingRepository {
    constructor(pool) {
        this.pool = pool;
    }
    async transaction(fn) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    async list(limit = 50, offset = 0) {
        const rows = await this.pool.query(
            'SELECT id, version, payload, status FROM publishing_plans ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit + 1, offset]
        );
        const page = rows.rows.slice(0, limit);
        const deliveries = page.length
            ? await this.pool.query(
                  'SELECT id, plan_id, plan_version, account_id, item_index, occurrence, due_at, status, provider_post_id, error FROM publishing_deliveries WHERE plan_id = ANY($1::uuid[]) ORDER BY due_at',
                  [page.map((p) => p.id)]
              )
            : { rows: [] };
        const latestDeliveryVersion = new Map();
        for (const delivery of deliveries.rows)
            latestDeliveryVersion.set(
                delivery.plan_id,
                Math.max(latestDeliveryVersion.get(delivery.plan_id) || 0, delivery.plan_version)
            );
        return {
            plans: page.map((p) => ({
                id: p.id,
                version: p.version,
                ...p.payload,
                status: p.status,
                deliveries: deliveries.rows.filter(
                    (d) =>
                        d.plan_id === p.id &&
                        ['scheduled', 'cancelled'].includes(p.status) &&
                        d.plan_version === latestDeliveryVersion.get(p.id) &&
                        d.plan_version >= p.version - 1
                )
            })),
            nextOffset: rows.rows.length > limit ? offset + limit : null
        };
    }
    async listApprovals(limit = 50, offset = 0, status = 'all', actorId = null, planId = null) {
        const selected = status === 'all' ? ['pending', 'scheduled', 'rejected'] : [status];
        const [rows, totals] = await Promise.all([
            this.pool.query(
                `SELECT p.id,p.version,p.status,p.payload,p.created_at,p.updated_at,
                        creator.name AS created_by_name,reviewer.name AS reviewed_by_name,
                        review.created_at AS reviewed_at,mail.status AS email_status,
                        delivery.total AS delivery_count,delivery.published AS published_count,
                        delivery.locked AS locked_count
                 FROM publishing_plans p
                 LEFT JOIN studio_users creator ON creator.id=p.created_by
                 LEFT JOIN LATERAL (
                    SELECT h.actor_id,h.created_at FROM studio_plan_history h
                    WHERE h.plan_id=p.id AND h.status IN ('scheduled','rejected')
                      AND (h.status<>'scheduled' OR NOT (h.payload ? 'cancellationReason'))
                    ORDER BY h.id DESC LIMIT 1
                 ) review ON p.status IN ('scheduled','rejected')
                 LEFT JOIN studio_users reviewer ON reviewer.id=review.actor_id
                 LEFT JOIN LATERAL (
                    SELECT m.status FROM studio_automation_messages m
                    WHERE m.plan_id=p.id AND m.plan_version=p.version
                      AND m.recipient_user_id=$4 AND m.kind='approval_requested'
                    LIMIT 1
                 ) mail ON true
                 LEFT JOIN LATERAL (
                    SELECT count(*)::int AS total,
                           count(*) FILTER (WHERE d.status='published')::int AS published,
                           count(*) FILTER (WHERE d.status IN ('running','published','unknown'))::int AS locked,
                           array_agg(d.provider_post_id) FILTER (WHERE d.status='published' AND d.provider_post_id IS NOT NULL) AS provider_post_ids
                    FROM publishing_deliveries d
                    WHERE p.status='scheduled' AND d.plan_id=p.id AND d.plan_version=(
                        SELECT max(latest.plan_version) FROM publishing_deliveries latest
                        WHERE latest.plan_id=p.id AND latest.plan_version BETWEEN p.version-1 AND p.version
                    )
                 ) delivery ON true
                 WHERE p.status=ANY($3::text[]) AND ($5::uuid IS NULL OR p.id=$5::uuid)
                 ORDER BY CASE WHEN p.status='pending' THEN 0 ELSE 1 END,p.updated_at DESC,p.id DESC
                 LIMIT $1 OFFSET $2`,
                [limit + 1, offset, selected, actorId, planId]
            ),
            this.pool.query(
                "SELECT status,count(*)::int AS total FROM publishing_plans WHERE status IN ('pending','scheduled','rejected') GROUP BY status"
            )
        ]);
        return {
            items: rows.rows.slice(0, limit).map((row) => ({
                id: row.id,
                version: row.version,
                status: row.status,
                ...row.payload,
                status: row.status,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                createdByName: row.created_by_name,
                reviewedByName: row.reviewed_by_name,
                reviewedAt: row.reviewed_at,
                emailStatus: row.email_status,
                deliveryCount: row.delivery_count,
                publishedCount: row.published_count,
                providerPostIds: row.provider_post_ids || [],
                isLocked: row.locked_count > 0
            })),
            counts: Object.fromEntries(
                ['pending', 'scheduled', 'rejected'].map((key) => [
                    key,
                    totals.rows.find((row) => row.status === key)?.total || 0
                ])
            ),
            nextOffset: rows.rows.length > limit ? offset + limit : null
        };
    }
    async expirePending(now = Date.now()) {
        return this.transaction(async (client) => {
            const cancelledAt = new Date(now).toISOString();
            const result = await client.query(
                "UPDATE publishing_plans SET status='cancelled', payload=payload || jsonb_build_object('cancellationReason','Quá giờ đăng nhưng chưa được duyệt','cancelledAt',$1::text),version=version+1,updated_at=now(),updated_by=NULL WHERE status='pending' AND (payload->>'scheduledAt')::timestamptz <= $1::timestamptz RETURNING id",
                [cancelledAt]
            );
            for (const row of result.rows)
                await audit(client, null, 'approval.expired', 'publishing_plans', row.id, null, {
                    status: 'cancelled'
                });
            return result.rows.length;
        });
    }
    async expireScheduled(now = Date.now()) {
        // Give the worker one polling window to claim a due delivery. Afterwards it must
        // never publish it late, even if the worker starts after an outage.
        const cutoff = new Date(now - 120000).toISOString();
        const cancelledAt = new Date(now).toISOString();
        return this.transaction(async (client) => {
            const plans = await client.query(
                "SELECT p.id,p.version FROM publishing_plans p WHERE p.status='scheduled' AND EXISTS (SELECT 1 FROM publishing_deliveries d WHERE d.plan_id=p.id AND d.plan_version=p.version AND d.status='queued' AND d.due_at <= $1::timestamptz) FOR UPDATE OF p SKIP LOCKED",
                [cutoff]
            );
            let cancelled = 0;
            for (const plan of plans.rows) {
                const missed = await client.query(
                    "UPDATE publishing_deliveries d SET status='cancelled',error='Quá giờ đăng nhưng chưa được đăng',finished_at=$3::timestamptz WHERE d.plan_id=$1 AND d.plan_version=$2 AND d.status='queued' AND EXISTS (SELECT 1 FROM publishing_deliveries first WHERE first.plan_id=d.plan_id AND first.plan_version=d.plan_version AND first.account_id=d.account_id AND first.occurrence=d.occurrence AND first.status='queued' AND first.due_at <= $4::timestamptz AND first.item_index <= d.item_index) RETURNING d.id",
                    [plan.id, plan.version, cancelledAt, cutoff]
                );
                if (!missed.rows.length) continue;
                cancelled += missed.rows.length;
                const remaining = await client.query(
                    "SELECT 1 FROM publishing_deliveries WHERE plan_id=$1 AND plan_version=$2 AND status<>'cancelled' LIMIT 1",
                    [plan.id, plan.version]
                );
                if (!remaining.rows.length)
                    await client.query(
                        "UPDATE publishing_plans SET status='cancelled',payload=payload || jsonb_build_object('cancellationReason','Quá giờ đăng nhưng chưa được đăng','cancelledAt',$2::text),version=version+1,updated_at=now(),updated_by=NULL WHERE id=$1 AND version=$3",
                        [plan.id, cancelledAt, plan.version]
                    );
                await audit(client, null, 'schedule.expired', 'publishing_plans', plan.id, null, {
                    cancelledDeliveries: missed.rows.length
                });
            }
            return cancelled;
        });
    }
    async write(id, plan, version, actor) {
        return this.transaction(async (client) => {
            let row;
            if (version) {
                const prior = await client.query(
                    'SELECT version,status FROM publishing_plans WHERE id = $1 FOR UPDATE',
                    [id]
                );
                if (!prior.rows.length) throw new PublishingError(404, 'Không tìm thấy kế hoạch.');
                if (prior.rows[0].version !== version)
                    throw new PublishingError(409, 'Kế hoạch đã thay đổi. Tải lại trước khi sửa.');
                if (
                    ['cancelled', 'rejected'].includes(prior.rows[0].status) &&
                    plan.status !== 'pending'
                )
                    throw new PublishingError(
                        409,
                        'Bài đã hủy hoặc bị từ chối cần sửa và gửi lại để duyệt.'
                    );
                const sent = await client.query(
                    "SELECT id FROM publishing_deliveries WHERE plan_id = $1 AND status IN ('running','published','unknown') LIMIT 1",
                    [id]
                );
                if (sent.rows.length)
                    throw new PublishingError(
                        409,
                        'Kế hoạch đã bắt đầu đăng; chỉ có thể hủy các lượt còn chờ.'
                    );
                await client.query(
                    "UPDATE publishing_deliveries SET status='cancelled' WHERE plan_id=$1 AND status='queued'",
                    [id]
                );
                row = (
                    await client.query(
                        'UPDATE publishing_plans SET payload = $2::jsonb, status = $3, version = version + 1, updated_at = now(),updated_by=$4 WHERE id = $1 RETURNING version',
                        [id, JSON.stringify(plan), plan.status, actor?.id || null]
                    )
                ).rows[0];
            } else
                row = (
                    await client.query(
                        'INSERT INTO publishing_plans (id,payload,status,created_by,updated_by) VALUES ($1,$2::jsonb,$3,$4,$4) ON CONFLICT (id) DO NOTHING RETURNING version',
                        [id, JSON.stringify(plan), plan.status, actor?.id || null]
                    )
                ).rows[0];
            if (!row) {
                const existing = (
                    await client.query(
                        'SELECT version, payload, status FROM publishing_plans WHERE id = $1',
                        [id]
                    )
                ).rows[0];
                if (
                    !existing ||
                    existing.version !== 1 ||
                    existing.status !== plan.status ||
                    !isDeepStrictEqual(existing.payload, plan)
                )
                    throw new PublishingError(
                        409,
                        'ID kế hoạch đã dùng. Tải lại để kiểm tra trước khi gửi lại.'
                    );
                return { id, version: existing.version, ...plan };
            }
            const deliveries = deliveriesFor(plan, id).map((d) => ({
                id: d.id,
                plan_id: id,
                plan_version: row.version,
                account_id: d.accountId,
                item_index: d.index,
                occurrence: d.occurrence,
                due_at: d.dueAt
            }));
            if (deliveries.length)
                await client.query(
                    'INSERT INTO publishing_deliveries (id,plan_id,plan_version,account_id,item_index,occurrence,due_at) SELECT id,plan_id,plan_version,account_id,item_index,occurrence,due_at FROM jsonb_to_recordset($1::jsonb) AS d(id uuid,plan_id uuid,plan_version integer,account_id text,item_index integer,occurrence integer,due_at timestamptz)',
                    [JSON.stringify(deliveries)]
                );
            return { id, ...row, ...plan };
        });
    }
    async cancel(id, version, actor) {
        return this.transaction(async (client) => {
            const prior = await client.query(
                'SELECT version,status FROM publishing_plans WHERE id=$1 FOR UPDATE',
                [id]
            );
            if (!prior.rows.length || prior.rows[0].version !== version)
                throw new PublishingError(409, 'Kế hoạch không tồn tại hoặc đã thay đổi.');
            if (!['draft', 'pending', 'scheduled'].includes(prior.rows[0].status))
                throw new PublishingError(409, 'Kế hoạch không còn có thể hủy. Hãy tải lại.');
            const reason = 'Đã hủy lịch theo yêu cầu';
            const cancelled = await client.query(
                "UPDATE publishing_deliveries SET status='cancelled',error=$3,finished_at=now() WHERE plan_id=$1 AND plan_version=$2 AND status='queued' RETURNING id",
                [id, version, reason]
            );
            if (prior.rows[0].status === 'scheduled' && !cancelled.rows.length)
                throw new PublishingError(409, 'Không còn lượt chờ nào để hủy. Hãy tải lại.');
            const remaining = await client.query(
                "SELECT 1 FROM publishing_deliveries WHERE plan_id=$1 AND plan_version=$2 AND status<>'cancelled' LIMIT 1",
                [id, version]
            );
            const status = remaining.rows.length ? 'scheduled' : 'cancelled';
            const result = await client.query(
                "UPDATE publishing_plans SET status=$3,payload=payload || jsonb_build_object('cancellationReason',$4::text,'cancelledAt',now()::text),version=version+1,updated_at=now(),updated_by=$5 WHERE id=$1 AND version=$2 RETURNING version,status",
                [id, version, status, reason, actor?.id || null]
            );
            await audit(client, actor, 'schedule.cancelled', 'publishing_plans', id, null, {
                reason,
                cancelledDeliveries: cancelled.rows.length,
                status
            });
            return result.rows[0];
        });
    }
    async reject(id, version, reason, actor) {
        return this.transaction(async (client) => {
            const result = await client.query(
                `UPDATE publishing_plans
                 SET status='rejected',version=version+1,updated_at=now(),updated_by=$4,
                     payload=payload || jsonb_build_object('rejectionReason',$3::text,'rejectedAt',now()::text)
                 WHERE id=$1 AND version=$2 AND status='pending'
                 RETURNING id,version`,
                [id, version, reason, actor?.id || null]
            );
            if (!result.rows.length)
                throw new PublishingError(
                    409,
                    'Bài không còn ở trạng thái chờ duyệt hoặc đã thay đổi. Hãy tải lại.'
                );
            await audit(client, actor, 'approval.rejected', 'publishing_plans', id, null, {
                reason
            });
            return result.rows[0];
        });
    }
    async deletePlan(id, version, actor) {
        return this.transaction(async (client) => {
            const result = await client.query(
                'SELECT version,status,payload FROM publishing_plans WHERE id=$1 FOR UPDATE',
                [id]
            );
            if (!result.rows.length) throw new PublishingError(404, 'Không tìm thấy kế hoạch.');
            const plan = result.rows[0];
            if (plan.version !== version)
                throw new PublishingError(409, 'Kế hoạch đã thay đổi. Tải lại trước khi xóa.');
            const active = await client.query(
                "SELECT 1 FROM publishing_deliveries WHERE plan_id=$1 AND status IN ('running','unknown') LIMIT 1",
                [id]
            );
            if (active.rows.length)
                throw new PublishingError(
                    409,
                    'Có lượt đăng đang xử lý hoặc chưa rõ kết quả. Kiểm tra Page trước khi xóa.'
                );
            await audit(client, actor, 'approval.deleted', 'publishing_plans', id, null, {
                name: plan.payload.name,
                status: plan.status,
                version
            });
            await client.query(
                'DELETE FROM studio_delivery_history WHERE delivery_id IN (SELECT id FROM publishing_deliveries WHERE plan_id=$1)',
                [id]
            );
            await client.query('DELETE FROM studio_automation_messages WHERE plan_id=$1', [id]);
            await client.query('DELETE FROM studio_plan_history WHERE plan_id=$1', [id]);
            await client.query('DELETE FROM publishing_deliveries WHERE plan_id=$1', [id]);
            await client.query('DELETE FROM publishing_plans WHERE id=$1', [id]);
            return { id, deleted: true };
        });
    }
    async claim() {
        return this.transaction(async (client) => {
            // Interrupted provider calls have an unknown outcome; never automatically retry them.
            await client.query(
                "UPDATE publishing_deliveries SET status = 'unknown', error = 'Worker bị gián đoạn. Kiểm tra Page trước khi tạo lượt đăng mới.' WHERE status = 'running' AND started_at < now() - interval '2 minutes'"
            );
            await client.query(
                "UPDATE publishing_deliveries d SET status = 'failed', error = 'Một nội dung trước đó chưa đăng thành công.' WHERE d.status = 'queued' AND EXISTS (SELECT 1 FROM publishing_deliveries prev WHERE prev.plan_id = d.plan_id AND prev.plan_version = d.plan_version AND prev.account_id = d.account_id AND prev.occurrence = d.occurrence AND prev.item_index < d.item_index AND prev.status IN ('failed','unknown','cancelled'))"
            );
            const found = await client.query(
                "SELECT d.*, p.payload FROM publishing_deliveries d JOIN publishing_plans p ON p.id = d.plan_id WHERE d.status = 'queued' AND d.due_at <= now() AND d.due_at > now() - interval '2 minutes' AND p.status = 'scheduled' AND d.plan_version = p.version AND NOT EXISTS (SELECT 1 FROM publishing_deliveries prev WHERE prev.plan_id = d.plan_id AND prev.plan_version = d.plan_version AND prev.account_id = d.account_id AND prev.occurrence = d.occurrence AND prev.item_index < d.item_index AND prev.status <> 'published') ORDER BY d.due_at LIMIT 1 FOR UPDATE OF p, d SKIP LOCKED"
            );
            if (!found.rows.length) return null;
            await client.query(
                "UPDATE publishing_deliveries SET status = 'running', started_at = now() WHERE id = $1",
                [found.rows[0].id]
            );
            return found.rows[0];
        });
    }
    async claimNow(planId, deliveryId, version, actor) {
        return this.transaction(async (client) => {
            const found = await client.query(
                "SELECT d.*,p.payload FROM publishing_deliveries d JOIN publishing_plans p ON p.id=d.plan_id WHERE p.id=$1 AND d.id=$2 AND p.version=$3 AND d.plan_version=p.version AND p.status='scheduled' AND d.status='queued' AND d.item_index=0 AND d.due_at > now()-interval '2 minutes' FOR UPDATE OF p,d SKIP LOCKED",
                [planId, deliveryId, version]
            );
            if (!found.rows.length)
                throw new PublishingError(
                    409,
                    'Lượt đăng đã thay đổi, quá hạn hoặc đang được xử lý. Tải lại lịch trước khi thử tiếp.'
                );
            await client.query(
                "UPDATE publishing_deliveries SET status='running',started_at=now() WHERE id=$1",
                [deliveryId]
            );
            await audit(
                client,
                actor,
                'publish.manual.claimed',
                'publishing_deliveries',
                deliveryId,
                null,
                {
                    planId
                }
            );
            return found.rows[0];
        });
    }
    async finish(id, status, providerId, error) {
        await this.pool.query(
            'UPDATE publishing_deliveries SET status = $2, provider_post_id = $3, error = $4, finished_at = now() WHERE id = $1',
            [id, status, providerId || null, error || null]
        );
    }
}
function publishingRouter({ repository, social, enabled = false }) {
    const router = express.Router();
    router.use(social.localOnly);
    const handle = (fn) => async (req, res) => {
        try {
            if (!repository)
                throw new PublishingError(
                    503,
                    'Cần PostgreSQL và npm run db:migrate để lưu kế hoạch server.'
                );
            await fn(req, res);
        } catch (e) {
            res.status(e instanceof PublishingError ? e.status : 503).json({
                error: e instanceof PublishingError ? e.message : storageError(e)
            });
        }
    };
    router.get('/status', async (req, res) => {
        try {
            if (!repository) {
                res.json({
                    ready: false,
                    workerEnabled: enabled,
                    error: 'Chưa cấu hình DATABASE_URL. Lịch cục bộ không tự đăng.'
                });
                return;
            }
            await repository.expirePending();
            await repository.expireScheduled();
            await expireWorkspace(repository.pool);
            res.json({ ready: true, workerEnabled: enabled });
        } catch (error) {
            res.json({ ready: false, workerEnabled: enabled, error: storageError(error) });
        }
    });
    router.get(
        '/plans',
        handle(async (req, res) => {
            const offset = Number(req.query.offset || 0),
                limit = Number(req.query.limit || 50);
            if (
                !Number.isInteger(offset) ||
                offset < 0 ||
                !Number.isInteger(limit) ||
                limit < 1 ||
                limit > 100
            )
                throw new PublishingError(400, 'Phân trang không hợp lệ.');
            await repository.expirePending();
            await repository.expireScheduled();
            res.json(await repository.list(limit, offset));
        })
    );
    router.get(
        '/approvals',
        handle(async (req, res) => {
            const offset = Number(req.query.offset || 0);
            const limit = Number(req.query.limit || 50);
            const status = req.query.status || 'all';
            const planId = req.query.planId || null;
            if (
                !Number.isInteger(offset) ||
                offset < 0 ||
                !Number.isInteger(limit) ||
                limit < 1 ||
                limit > 100 ||
                !['all', 'pending', 'scheduled', 'rejected'].includes(status) ||
                (planId !== null && (typeof planId !== 'string' || !uuid.test(planId)))
            )
                throw new PublishingError(400, 'Bộ lọc hoặc phân trang không hợp lệ.');
            await repository.expirePending();
            res.json(await repository.listApprovals(limit, offset, status, req.actor?.id, planId));
        })
    );
    const write = handle(async (req, res) => {
        await repository.expirePending();
        await repository.expireScheduled();
        const plan = validatePlan(req.body);
        if (
            req.actor?.role === 'viewer' ||
            (req.actor?.role === 'editor' && !['draft', 'pending'].includes(plan.status))
        )
            throw new PublishingError(403, 'Chỉ người quản lý được lên lịch đăng.');
        if (
            req.actor?.role === 'editor' &&
            plan.status === 'pending' &&
            Date.parse(plan.scheduledAt) < Date.now() + 60 * 60 * 1000
        )
            throw new PublishingError(
                403,
                'Không có thẩm quyền gửi duyệt bài đăng trong vòng 1 giờ tới. Hãy chọn giờ đăng cách hiện tại ít nhất 1 giờ để Admin/Manager có thời gian nhận thông báo.'
            );
        if (req.actor?.role === 'editor' && req.params.id) {
            const old = (
                await repository.pool.query('SELECT status FROM publishing_plans WHERE id=$1', [
                    req.params.id
                ])
            ).rows[0];
            if (old && !['draft', 'pending', 'cancelled', 'rejected'].includes(old.status))
                throw new PublishingError(403, 'Không được sửa kế hoạch đã lên lịch.');
        }
        if (
            req.params.id &&
            (!uuid.test(req.params.id) ||
                !Number.isInteger(req.body.version) ||
                req.body.version < 1)
        )
            throw new PublishingError(400, 'ID hoặc phiên bản không hợp lệ.');
        for (const id of plan.accountIds)
            if (!social.hasAccount(id))
                throw new PublishingError(403, 'Tài khoản chưa được liên kết trên server.');
        if (
            req.body.id !== undefined &&
            (typeof req.body.id !== 'string' || !uuid.test(req.body.id))
        )
            throw new PublishingError(400, 'ID kế hoạch không hợp lệ.');
        const id = req.params.id || req.body.id || randomUUID();
        const result = await repository.write(
            id,
            plan,
            req.params.id ? req.body.version : null,
            req.actor
        );
        res.status(req.params.id ? 200 : 201)
            .location(`/api/publishing/plans/${id}`)
            .json(result);
    });
    router.post('/plans', write);
    router.put('/plans/:id', write);
    router.delete(
        '/plans/:id',
        handle(async (req, res) => {
            if (req.actor?.role !== 'admin')
                throw new PublishingError(403, 'Chỉ Admin được xóa bài trong Omni Studio.');
            if (
                !uuid.test(req.params.id) ||
                !Number.isInteger(req.body?.version) ||
                req.body.version < 1
            )
                throw new PublishingError(400, 'ID hoặc phiên bản không hợp lệ.');
            res.json(await repository.deletePlan(req.params.id, req.body.version, req.actor));
        })
    );
    router.post(
        '/plans/:id/approve',
        handle(async (req, res) => {
            if (req.actor && !['admin', 'manager'].includes(req.actor.role))
                throw new PublishingError(403, 'Chỉ người quản lý được duyệt lịch.');
            if (!uuid.test(req.params.id) || !Number.isInteger(req.body?.version))
                throw new PublishingError(400, 'ID hoặc phiên bản không hợp lệ.');
            await repository.expirePending();
            await repository.expireScheduled();
            const old = (
                await repository.pool.query(
                    'SELECT payload,status,version FROM publishing_plans WHERE id=$1',
                    [req.params.id]
                )
            ).rows[0];
            if (!old) throw new PublishingError(404, 'Không tìm thấy kế hoạch.');
            if (old.status !== 'pending')
                throw new PublishingError(
                    409,
                    'Chỉ duyệt bài đang chờ và chưa quá giờ. Tải lại trạng thái.'
                );
            const plan = validatePlan({ ...old.payload, status: 'scheduled' });
            for (const id of plan.accountIds)
                if (!social.hasAccount(id))
                    throw new PublishingError(403, 'Tài khoản chưa được liên kết trên server.');
            res.json(await repository.write(req.params.id, plan, req.body.version, req.actor));
        })
    );
    router.post(
        '/plans/:id/reject',
        handle(async (req, res) => {
            if (req.actor && !['admin', 'manager'].includes(req.actor.role))
                throw new PublishingError(403, 'Chỉ Admin/Manager được từ chối bài.');
            const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
            if (
                !uuid.test(req.params.id) ||
                !Number.isInteger(req.body?.version) ||
                req.body.version < 1 ||
                !reason ||
                reason.length > 500
            )
                throw new PublishingError(400, 'Cần nhập lý do từ chối, tối đa 500 ký tự.');
            await repository.expirePending();
            res.json(await repository.reject(req.params.id, req.body.version, reason, req.actor));
        })
    );
    router.post(
        '/plans/:id/cancel',
        handle(async (req, res) => {
            if (
                !uuid.test(req.params.id) ||
                !Number.isInteger(req.body?.version) ||
                req.body.version < 1
            )
                throw new PublishingError(400, 'ID hoặc phiên bản không hợp lệ.');
            if (req.actor && !['admin', 'manager'].includes(req.actor.role))
                throw new PublishingError(403, 'Chỉ người quản lý được hủy lịch.');
            res.json(await repository.cancel(req.params.id, req.body.version, req.actor));
        })
    );
    router.post(
        '/plans/:id/deliveries/:deliveryId/publish-now',
        handle(async (req, res) => {
            if (req.actor && !['admin', 'manager'].includes(req.actor.role))
                throw new PublishingError(403, 'Chỉ Admin/Manager được đăng ngay.');
            if (
                !uuid.test(req.params.id) ||
                !uuid.test(req.params.deliveryId) ||
                !Number.isInteger(req.body?.version) ||
                req.body.version < 1
            )
                throw new PublishingError(400, 'ID hoặc phiên bản không hợp lệ.');
            await repository.expireScheduled();
            const delivery = await repository.claimNow(
                req.params.id,
                req.params.deliveryId,
                req.body.version,
                req.actor
            );
            res.json(await publishDelivery(repository, social, delivery));
        })
    );
    return router;
}
async function publishDelivery(repository, social, delivery) {
    const item = delivery.payload.items[delivery.item_index];
    let result;
    try {
        result = await social.publish({
            accountId: delivery.account_id,
            noiDungBaiViet: item.content,
            image: item.image || undefined,
            requestId: delivery.id
        });
    } catch (error) {
        const safe = social.publicError(error);
        // Provider 5xx and transport failures may have published already.
        const status = [400, 401, 403].includes(safe.status) ? 'failed' : 'unknown';
        await repository.finish(delivery.id, status, null, safe.error);
        return { deliveryId: delivery.id, status, error: safe.error };
    }
    // A database failure here leaves the delivery running, later unknown. Never call the provider again.
    await repository.finish(delivery.id, 'published', result.facebookPostId);
    return {
        deliveryId: delivery.id,
        status: 'published',
        providerPostId: result.facebookPostId
    };
}
async function runOnce(repository, social) {
    const delivery = await repository.claim();
    if (!delivery) return false;
    await publishDelivery(repository, social, delivery);
    return true;
}
function createPublishing(social, env = process.env) {
    const pool = env.DATABASE_URL
        ? new Pool({
              connectionString: env.DATABASE_URL,
              connectionTimeoutMillis: 3000,
              query_timeout: 5000,
              max: 4
          })
        : null;
    const repository = pool ? new PublishingRepository(pool) : null;
    const enabled = env.PUBLISHING_WORKER_ENABLED === 'true';
    return { router: publishingRouter({ repository, social, enabled }), repository, enabled };
}
module.exports = {
    PublishingError,
    validatePlan,
    deliveriesFor,
    PublishingRepository,
    publishingRouter,
    createPublishing,
    runOnce
};

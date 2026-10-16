const crypto = require('node:crypto');
const { SocialError } = require('./social');
const { audit, safePayload } = require('./data-store');
async function publishDurably(pool, social, body, actor) {
    if (!body || typeof body.noiDungBaiViet !== 'string' || !body.noiDungBaiViet.trim())
        throw new SocialError(400, 'Nhập nội dung bài viết.');
    const id = body.requestId || crypto.randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        throw new SocialError(400, 'requestId không hợp lệ.');
    const fingerprint = crypto
        .createHash('sha256')
        .update(
            JSON.stringify([
                body.accountId || 'facebook:' + process.env.PAGE_ID,
                body.noiDungBaiViet,
                body.image || ''
            ])
        )
        .digest('hex');
    const inserted = await pool.query(
        "INSERT INTO studio_publish_requests(id,workspace_id,actor_id,fingerprint,status) VALUES($1,1,$2,$3,'pending') ON CONFLICT DO NOTHING RETURNING id",
        [id, actor.id, fingerprint]
    );
    if (!inserted.rows.length) {
        const prior = (
            await pool.query(
                'SELECT status,result,fingerprint FROM studio_publish_requests WHERE id=$1 AND workspace_id=1',
                [id]
            )
        ).rows[0];
        if (prior.fingerprint !== fingerprint)
            throw new SocialError(409, 'requestId đã dùng cho nội dung khác.');
        if (prior.status === 'published') return prior.result;
        throw new SocialError(
            409,
            'Yêu cầu đã gửi hoặc kết quả chưa rõ. Kiểm tra Page trước khi tạo lượt đăng mới.'
        );
    }
    let result;
    try {
        result = await social.publish({ ...body, requestId: id });
    } catch (e) {
        const error = social.publicError(e);
        await pool.query(
            'UPDATE studio_publish_requests SET status=$2,updated_at=now() WHERE id=$1',
            [id, [400, 401, 403].includes(error.status) ? 'failed' : 'unknown']
        );
        throw e;
    }
    await pool.query(
        "UPDATE studio_publish_requests SET status='published',result=$2::jsonb,updated_at=now() WHERE id=$1",
        [id, JSON.stringify(safePayload(result))]
    );
    const platform = body.accountId?.startsWith('instagram:') ? 'instagram' : 'facebook';
    await audit(pool, actor, 'publish', platform, id, null, result);
    return result;
}
module.exports = { publishDurably };

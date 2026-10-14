const { readRecords, synchronize, audit } = require('./data-store');

function expiredWorkspacePost(post, now) {
    if (!['Chờ duyệt', 'Đã lên lịch'].includes(post.status)) return null;
    const offset = {
        'Asia/Ho_Chi_Minh': '+07:00',
        'Asia/Singapore': '+08:00',
        UTC: 'Z'
    }[post.timezone || 'Asia/Ho_Chi_Minh'];
    if (!offset || !post.date || !post.time) return null;
    const due = Date.parse(`${post.date}T${post.time}:00${offset}`);
    if (!Number.isFinite(due) || due > now) return null;
    if (post.status === 'Đã lên lịch' && (post.facebookPostId || post.publishResults?.length))
        return null;
    return post.status === 'Chờ duyệt'
        ? 'Quá giờ đăng nhưng chưa được duyệt'
        : 'Quá giờ đăng nhưng chưa được đăng';
}

// Preserve legacy workspace submissions, snapshots and optimistic versions.
async function expireWorkspace(pool, now = Date.now()) {
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const prior = (await db.query('SELECT version FROM omni_workspace WHERE id=1 FOR UPDATE'))
            .rows[0];
        if (!prior) {
            await db.query('COMMIT');
            return;
        }
        const previous = await readRecords(db);
        const next = {
            ...previous,
            posts: previous.posts.map((post) => {
                const reason = expiredWorkspacePost(post, now);
                return reason
                    ? {
                          ...post,
                          status: 'Đã hủy',
                          cancellationReason: reason,
                          cancelledAt: new Date(now).toISOString()
                      }
                    : post;
            })
        };
        if (next.posts.some((post, i) => post !== previous.posts[i])) {
            await db.query(
                'INSERT INTO studio_snapshot_history(workspace_id,version,data) VALUES(1,$1,$2::jsonb) ON CONFLICT DO NOTHING',
                [prior.version, JSON.stringify(previous)]
            );
            await synchronize(db, previous, next, null);
            await db.query(
                'UPDATE omni_workspace SET data=$1::jsonb,version=version+1,updated_at=now() WHERE id=1',
                [JSON.stringify(next)]
            );
            await audit(db, null, 'schedule.expired', 'posts', null, null, null);
        }
        await db.query('COMMIT');
    } catch (error) {
        await db.query('ROLLBACK');
        throw error;
    } finally {
        db.release();
    }
}
module.exports = { expireWorkspace, expiredWorkspacePost };

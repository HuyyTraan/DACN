const path = require('node:path');
const { Pool } = require('pg');
const { runBrowserJob } = require('./automation');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

async function runOnce(pool, options = {}) {
    const email = options.email || process.env.RPA_EMAIL;
    const password = options.password || process.env.RPA_PASSWORD;
    const port = Number(options.port || process.env.PORT || 3000);
    const baseUrl = options.baseUrl || process.env.RPA_BASE_URL || `http://127.0.0.1:${port}`;
    let parsed;
    try {
        parsed = new URL(baseUrl);
    } catch {
        throw new Error('RPA_BASE_URL không hợp lệ.');
    }
    if (!email || !password || !Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('Cần RPA_EMAIL, RPA_PASSWORD và PORT hợp lệ.');
    if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash
    )
        throw new Error('RPA_BASE_URL phải là origin loopback của Omni Studio.');
    const reader = await pool.query(
        'SELECT id FROM studio_users WHERE lower(email)=lower($1) AND active',
        [email]
    );
    if (!reader.rows.length) throw new Error('Tài khoản RPA phải đang hoạt động.');
    await pool.query(
        `UPDATE studio_rpa_runs r SET status='failed',error='Bài hoặc phiên bản không còn chờ duyệt.',finished_at=now()
         WHERE r.kind='approval_read' AND r.status='queued'
           AND NOT EXISTS (SELECT 1 FROM publishing_plans p WHERE p.id=r.plan_id
             AND p.version=r.plan_version AND p.status='pending'
             AND (p.payload->>'scheduledAt')::timestamptz>now())`
    );
    const row = (
        await pool.query(
            `UPDATE studio_rpa_runs r SET status='running',actor_id=$1
             WHERE r.id=(SELECT q.id FROM studio_rpa_runs q WHERE q.status='queued'
                 ORDER BY q.created_at FOR UPDATE SKIP LOCKED LIMIT 1)
             RETURNING r.id,r.kind,r.plan_id,r.plan_version`,
            [reader.rows[0].id]
        )
    ).rows[0];
    if (!row) return false;
    try {
        const output = await (options.runBrowserJob || runBrowserJob)({
            kind: row.kind,
            credentials: { email, password },
            port,
            baseUrl,
            runId: row.id,
            planId: row.plan_id,
            planVersion: row.plan_version
        });
        if (row.kind === 'approval_read') {
            const result = await pool.query(
                `UPDATE studio_rpa_runs r SET status='success',result=$2::jsonb,
                        read_at=$3::timestamptz,finished_at=now()
                 WHERE r.id=$1 AND EXISTS (SELECT 1 FROM publishing_plans p
                    WHERE p.id=r.plan_id AND p.version=r.plan_version AND p.status='pending'
                      AND (p.payload->>'scheduledAt')::timestamptz>now())
                 RETURNING r.id`,
                [row.id, JSON.stringify(output), output.readAt]
            );
            if (!result.rowCount)
                await pool.query(
                    "UPDATE studio_rpa_runs SET status='failed',error='Bài hoặc phiên bản không còn chờ duyệt.',finished_at=now() WHERE id=$1",
                    [row.id]
                );
        } else {
            await pool.query(
                "UPDATE studio_rpa_runs SET status='success',artifact_name=$2,finished_at=now() WHERE id=$1",
                [row.id, output.join(',')]
            );
        }
    } catch (error) {
        const reason =
            error?.message === 'RPA_APPROVAL_MISMATCH'
                ? 'ID hoặc phiên bản trong giao diện không khớp job.'
                : error?.message === 'Phiên đăng nhập RPA không hợp lệ.'
                  ? 'Phiên đăng nhập RPA không hợp lệ.'
                  : error?.name === 'TimeoutError'
                    ? 'Hết thời gian chờ bài chờ duyệt trên giao diện.'
                    : 'Không thể đọc bài trên giao diện hoặc dữ liệu không khớp phiên bản.';
        await pool.query(
            "UPDATE studio_rpa_runs SET status='failed',error=$2,finished_at=now() WHERE id=$1",
            [
                row.id,
                row.kind === 'approval_read' ? reason : 'Không thể hoàn tất thao tác trình duyệt.'
            ]
        );
    }
    return true;
}

async function main() {
    if (!process.env.DATABASE_URL || !process.env.RPA_EMAIL || !process.env.RPA_PASSWORD)
        throw new Error('Cần DATABASE_URL và tài khoản RPA trong BE/.env.');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 3000
    });
    let stopped = false;
    process.on('SIGINT', () => (stopped = true));
    process.on('SIGTERM', () => (stopped = true));
    try {
        while (!stopped) {
            await runOnce(pool).catch(() => {
                console.error('RPA chưa truy cập được database hoặc trình duyệt.');
            });
            await new Promise((resolve) => setTimeout(resolve, 30000));
        }
    } finally {
        await pool.end();
    }
}

if (require.main === module)
    main().catch(() => {
        console.error('RPA worker chưa khởi động được. Kiểm tra BE/.env và migration 013.');
        process.exitCode = 1;
    });
module.exports = { runOnce };

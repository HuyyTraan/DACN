const path = require('node:path');
const { Pool } = require('pg');
const { runBrowserJob } = require('./automation');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

async function runOnce(pool, options = {}) {
    const email = options.email || process.env.RPA_EMAIL;
    const password = options.password || process.env.RPA_PASSWORD;
    const port = Number(options.port || process.env.PORT || 3000);
    if (!email || !password || !Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('Cần RPA_EMAIL, RPA_PASSWORD và PORT hợp lệ.');
    const row = (
        await pool.query(
            `UPDATE studio_rpa_runs SET status='running'
             WHERE id=(SELECT id FROM studio_rpa_runs WHERE status='queued'
                       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
             RETURNING id,kind`
        )
    ).rows[0];
    if (!row) return false;
    try {
        const artifacts = await (options.runBrowserJob || runBrowserJob)({
            kind: row.kind,
            credentials: { email, password },
            port,
            runId: row.id
        });
        await pool.query(
            "UPDATE studio_rpa_runs SET status='success',artifact_name=$2,finished_at=now() WHERE id=$1",
            [row.id, artifacts.join(',')]
        );
    } catch {
        await pool.query(
            "UPDATE studio_rpa_runs SET status='failed',error='Không thể hoàn tất thao tác trình duyệt.',finished_at=now() WHERE id=$1",
            [row.id]
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
        console.error('RPA worker chưa khởi động được. Kiểm tra BE/.env và migration 009.');
        process.exitCode = 1;
    });
module.exports = { runOnce };

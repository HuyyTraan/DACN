const path = require('node:path');
const fs = require('node:fs/promises');
const { Pool } = require('pg');
const crypto = require('node:crypto');
const { synchronize } = require('./data-store');
const { emptyWorkspace } = require('../../FE/public/domain');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
async function migrate() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL chưa được cấu hình.');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 3000
    });
    try {
        const db = await pool.connect();
        try {
            await db.query('SELECT pg_advisory_lock(723018)');
            await db.query(
                'CREATE TABLE IF NOT EXISTS studio_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())'
            );
            const folder = path.join(__dirname, '../db/migrations');
            for (const name of (await fs.readdir(folder))
                .filter((n) => n.endsWith('.sql'))
                .sort()) {
                const sql = await fs.readFile(path.join(folder, name), 'utf8');
                // Keep migration identity stable across Git's LF/CRLF checkout conversions.
                const normalizedSql = sql.replace(/\r\n?/g, '\n');
                const checksum = crypto.createHash('sha256').update(normalizedSql).digest('hex');
                const legacyCrLfChecksum = crypto
                    .createHash('sha256')
                    .update(normalizedSql.replace(/\n/g, '\r\n'))
                    .digest('hex');
                const old = (
                    await db.query('SELECT checksum FROM studio_migrations WHERE name=$1', [name])
                ).rows[0];
                if (old) {
                    if (old.checksum !== checksum && old.checksum !== legacyCrLfChecksum)
                        throw new Error('Migration đã áp dụng bị thay đổi: ' + name);
                    continue;
                }
                await db.query('BEGIN');
                try {
                    await db.query(sql.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''));
                    await db.query('INSERT INTO studio_migrations(name,checksum) VALUES($1,$2)', [
                        name,
                        checksum
                    ]);
                    await db.query('COMMIT');
                    console.log('Đã áp dụng ' + name);
                } catch (e) {
                    await db.query('ROLLBACK');
                    throw e;
                }
            }
            // Data backfill is separate from schema DDL and runs only once, without overwrites.
            const marker = 'backfill-workspace-v1';
            if (
                !(await db.query('SELECT name FROM studio_migrations WHERE name=$1', [marker])).rows
                    .length
            ) {
                await db.query('BEGIN');
                try {
                    await db.query(
                        "INSERT INTO studio_workspace(id,name) VALUES(1,'Omni Workspace') ON CONFLICT DO NOTHING"
                    );
                    await db.query(
                        'CREATE TABLE IF NOT EXISTS omni_workspace(id integer PRIMARY KEY CHECK(id=1),data jsonb NOT NULL,version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now())'
                    );
                    await db.query(
                        'INSERT INTO omni_workspace(id,data) VALUES(1,$1::jsonb) ON CONFLICT DO NOTHING',
                        [JSON.stringify(emptyWorkspace())]
                    );
                    const old = (
                        await db.query(
                            'SELECT data,version FROM omni_workspace WHERE id=1 FOR UPDATE'
                        )
                    ).rows[0];
                    await synchronize(db, emptyWorkspace(), old.data, null, true);
                    await db.query(
                        'INSERT INTO studio_snapshot_history(workspace_id,version,data) VALUES(1,$1,$2::jsonb) ON CONFLICT DO NOTHING',
                        [old.version, JSON.stringify(old.data)]
                    );
                    await db.query(
                        "INSERT INTO studio_migrations(name,checksum) VALUES($1,'data-backfill')",
                        [marker]
                    );
                    await db.query('COMMIT');
                    console.log('Đã chuyển dữ liệu workspace cũ; snapshot gốc được giữ lại.');
                } catch (e) {
                    await db.query('ROLLBACK');
                    throw e;
                }
            }
        } finally {
            await db.query('SELECT pg_advisory_unlock(723018)');
            db.release();
        }
    } finally {
        await pool.end();
    }
}
if (require.main === module)
    migrate().catch((error) => {
        console.error(
            error.code === '28P01'
                ? 'PostgreSQL từ chối mật khẩu (28P01). Sửa mật khẩu trong DATABASE_URL tại BE/.env.'
                : error.code === '3D000'
                  ? 'Database không tồn tại (3D000). Kiểm tra tên và chữ hoa/thường trong DATABASE_URL.'
                  : 'Migration chưa chạy được. Kiểm tra DATABASE_URL, PostgreSQL và quyền CREATE TABLE.'
        );
        process.exitCode = 1;
    });
module.exports = { migrate };

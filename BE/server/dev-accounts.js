// Public development fixtures; never use these passwords in a shared deployment.
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { passwordHash } = require('./auth');
const { audit } = require('./data-store');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const accounts = [
    { email: 'admin@omni.test', name: 'Dev Admin', role: 'admin', password: 'OmniAdmin2026!' },
    {
        email: 'manager@omni.test',
        name: 'Dev Manager',
        role: 'manager',
        password: 'OmniManager2026!'
    },
    { email: 'editor@omni.test', name: 'Dev Editor', role: 'editor', password: 'OmniEditor2026!' },
    { email: 'viewer@omni.test', name: 'Dev Viewer', role: 'viewer', password: 'OmniViewer2026!' }
];

async function main() {
    if (process.env.NODE_ENV === 'production' || !process.argv.includes('--local-dev')) {
        throw new Error('Chỉ chạy với --local-dev trong môi trường phát triển.');
    }
    const url = new URL(process.env.DATABASE_URL || '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        throw new Error('Tài khoản test công khai chỉ được tạo trong PostgreSQL trên máy cục bộ.');
    }
    const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 3000 });
    let db;
    try {
        db = await pool.connect();
        await db.query('BEGIN');
        await db.query('SELECT pg_advisory_xact_lock(723019)');
        for (const account of accounts) {
            if (account.role === 'admin') {
                const currentAdmin = await db.query(
                    "SELECT 1 FROM studio_users WHERE role='admin' AND active=true LIMIT 1"
                );
                if (currentAdmin.rows.length) {
                    console.log(
                        'Giữ nguyên Admin hiện có; không tạo tài khoản quản trị thử thứ hai.'
                    );
                    continue;
                }
            }
            const result = await db.query(
                'INSERT INTO studio_users(id,workspace_id,email,name,password_hash,role) VALUES($1,1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING id,email,name,role,active',
                [
                    crypto.randomUUID(),
                    account.email,
                    account.name,
                    await passwordHash(account.password),
                    account.role
                ]
            );
            if (result.rows.length) {
                const user = result.rows[0];
                await audit(db, null, 'dev.account.create', 'users', user.id, null, user);
                console.log(`Đã tạo ${account.email} (${account.role}).`);
            } else {
                console.log(
                    `Giữ nguyên ${account.email}: tài khoản đã tồn tại, không đổi mật khẩu/quyền.`
                );
            }
        }
        await db.query('COMMIT');
    } catch (error) {
        if (db) await db.query('ROLLBACK');
        throw error;
    } finally {
        db?.release();
        await pool.end();
    }
}

main().catch(() => {
    console.error(
        'Chưa tạo được tài khoản dev. Kiểm tra chế độ local-dev, DATABASE_URL cục bộ và migration.'
    );
    process.exitCode = 1;
});

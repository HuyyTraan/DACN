const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const url = new URL(process.env.DATABASE_URL);
const directory = path.join(__dirname, '../.data/backups');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(
    directory,
    'omni-' + new Date().toISOString().replace(/[:.]/g, '-') + '.dump'
);
const exe =
    process.env.PG_DUMP_PATH ||
    (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe' : 'pg_dump');
const result = spawnSync(exe, ['--format=custom', '--file', file], {
    env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password)
    },
    stdio: 'pipe'
});
if (result.status !== 0) {
    console.error('Backup chưa thành công. Kiểm tra PG_DUMP_PATH, kết nối và quyền thư mục.');
    process.exitCode = 1;
} else console.log('Đã tạo backup riêng trong BE/.data/backups.');

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { spawnSync } = require('node:child_process');
// SQL migrations are authoritative for the existing database; never run reset/db push here.
const command = process.argv.slice(2);
if (
    !['validate', 'generate', 'db'].includes(command[0]) ||
    (command[0] === 'db' && command[1] !== 'pull')
)
    throw new Error('Chỉ cho phép validate, generate hoặc db pull.');
const result = spawnSync(
    process.execPath,
    [
        require.resolve('prisma/build/index.js'),
        ...command,
        '--schema',
        path.join(__dirname, '../prisma/schema.prisma')
    ],
    { stdio: 'inherit', env: process.env }
);
process.exitCode = result.status === null ? 1 : result.status;

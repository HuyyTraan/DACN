process.env.RUN_DATABASE_TESTS = 'true';
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['--test', 'BE/test/database.integration.cjs'], {
    stdio: 'inherit',
    env: process.env
});
process.exitCode = result.status === null ? 1 : result.status;

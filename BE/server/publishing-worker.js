const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createSocial } = require('./social');
const { createPublishing, runOnce } = require('./publishing');
const social = createSocial();
const { repository, enabled } = createPublishing(social);
async function main() {
    if (!enabled || !repository) {
        console.log(
            'Worker chưa bật. Cần DATABASE_URL, migration và PUBLISHING_WORKER_ENABLED=true.'
        );
        if (repository) await repository.pool.end();
        return;
    }
    let stopped = false;
    process.on('SIGINT', () => {
        stopped = true;
    });
    process.on('SIGTERM', () => {
        stopped = true;
    });
    while (!stopped) {
        try {
            await runOnce(repository, social);
        } catch {
            console.error('Worker chưa truy cập được DB. Không gửi lại lượt có kết quả chưa rõ.');
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    await repository.pool.end();
}
if (require.main === module)
    main().catch(() => {
        process.exitCode = 1;
    });

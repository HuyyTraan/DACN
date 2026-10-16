const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function cloudflaredPath() {
    const binary = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    for (const directory of (process.env.PATH || '').split(path.delimiter)) {
        const candidate = path.join(directory, binary);
        if (directory && fs.existsSync(candidate)) return candidate;
    }
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        const root = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
        try {
            const packageDir = fs
                .readdirSync(root)
                .find((name) => name.startsWith('Cloudflare.cloudflared_'));
            const candidate = packageDir && path.join(root, packageDir, binary);
            if (candidate && fs.existsSync(candidate)) return candidate;
        } catch {
            return null;
        }
    }
    return null;
}

function cloudflaredAvailable() {
    return Boolean(cloudflaredPath());
}

class InstagramMediaTunnelError extends Error {
    constructor(message) {
        super(message);
        this.status = 503;
    }
}

async function withTemporaryPublicImage(
    image,
    publishWithUrl,
    { spawnProcess = spawn, binaryPath = cloudflaredPath() } = {}
) {
    const imageId = crypto.randomBytes(24).toString('hex');
    const server = http.createServer((req, res) => {
        if (req.method !== 'GET' || req.url !== `/media/${imageId}.jpg`) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': image.buffer.length,
            'Cache-Control': 'no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff'
        });
        res.end(image.buffer);
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    let child;
    try {
        if (!binaryPath) throw new InstagramMediaTunnelError('Chưa cài cloudflared.');
        child = spawnProcess(
            binaryPath,
            ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${address.port}`],
            { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const tunnelUrl = await new Promise((resolve, reject) => {
            let output = '';
            let publishedUrl = '';
            const timeout = setTimeout(
                () =>
                    reject(
                        new InstagramMediaTunnelError(
                            'Cloudflare Quick Tunnel chưa kết nối được. Kiểm tra DNS và kết nối Internet.'
                        )
                    ),
                45000
            );
            const inspect = (chunk) => {
                output = (output + chunk.toString()).slice(-12000);
                publishedUrl ||=
                    output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0] || '';
                if (publishedUrl && /Registered tunnel connection/i.test(output)) {
                    clearTimeout(timeout);
                    resolve(publishedUrl);
                }
            };
            child.stdout?.on('data', inspect);
            child.stderr?.on('data', inspect);
            child.once('error', (error) => {
                clearTimeout(timeout);
                reject(
                    new InstagramMediaTunnelError(
                        error.code === 'ENOENT'
                            ? 'Chưa cài cloudflared. Cài Cloudflare Tunnel rồi khởi động lại API.'
                            : 'Không khởi động được Cloudflare Quick Tunnel.'
                    )
                );
            });
            child.once('exit', () => {
                clearTimeout(timeout);
                reject(
                    new InstagramMediaTunnelError(
                        'Cloudflare Quick Tunnel đã dừng trước khi sẵn sàng.'
                    )
                );
            });
        });
        return await publishWithUrl(`${tunnelUrl}/media/${imageId}.jpg`);
    } finally {
        if (child && child.exitCode === null) child.kill();
        await new Promise((resolve) => server.close(resolve));
    }
}

module.exports = {
    withTemporaryPublicImage,
    InstagramMediaTunnelError,
    cloudflaredAvailable,
    cloudflaredPath
};

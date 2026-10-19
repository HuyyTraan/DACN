const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

const outputRoot = path.join(__dirname, '../rpa/output');
const kinds = new Set(['dashboard_screenshot', 'weekly_csv']);
const files = {
    dashboard_screenshot: ['dashboard.png'],
    weekly_csv: ['post-insights.csv', 'traffic.csv']
};

async function scanApprovalReminders(pool, at = new Date()) {
    const now = at.toISOString();
    // One message per recipient and plan revision. Expired and approved plans never qualify.
    const result = await pool.query(
        `INSERT INTO studio_automation_messages(plan_id,plan_version,recipient_user_id,recipient_email,kind)
         SELECT p.id,p.version,u.id,u.email,reminder.kind
         FROM publishing_plans p
         CROSS JOIN LATERAL (VALUES
            ('approval_due_soon', (p.payload->>'scheduledAt')::timestamptz <= $1::timestamptz + interval '3 hours' AND p.updated_at <= $1::timestamptz - interval '1 hour'),
            ('approval_overdue', p.updated_at <= $1::timestamptz - interval '2 days')
         ) AS reminder(kind,due)
         JOIN studio_users u ON u.workspace_id=1 AND u.active AND u.role IN ('admin','manager')
                            AND u.email !~* '\.test$'
         WHERE p.status='pending' AND (p.payload->>'scheduledAt')::timestamptz > $1::timestamptz
           AND reminder.due
         ON CONFLICT DO NOTHING RETURNING id`,
        [now]
    );
    return result.rowCount;
}

async function readApprovalPage(page, planId, planVersion, open) {
    await open(`posts/approvals/${planId}`);
    await page.getByRole('heading', { name: 'Duyệt bài viết' }).waitFor();
    await page
        .getByRole('button', { name: /Chưa duyệt/ })
        .first()
        .click();
    const row = page.locator(`tr[data-plan-id="${planId}"]`);
    await row.waitFor({ timeout: 15000 });
    await row.getByRole('button', { name: 'Xem chi tiết' }).click();
    const dialog = page.getByRole('dialog', { name: 'Chi tiết bài duyệt' });
    await dialog.waitFor();
    const value = async (testId) => (await dialog.getByTestId(testId).innerText()).trim();
    const contents = await dialog.getByTestId('approval-content').allInnerTexts();
    const result = {
        planId: await value('approval-plan-id'),
        planVersion: Number(await value('approval-plan-version')),
        name: await value('approval-name'),
        creator: await value('approval-creator'),
        content: contents.map((text) => text.trim()).join('\n\n'),
        pages: await value('approval-pages'),
        scheduledAt: await value('approval-scheduled-at'),
        readAt: new Date().toISOString()
    };
    if (result.planId !== planId || result.planVersion !== planVersion || !result.content)
        throw new Error('RPA_APPROVAL_MISMATCH');
    return result;
}

async function runBrowserJob({
    kind,
    cookie,
    credentials,
    port = 3000,
    baseUrl = `http://127.0.0.1:${port}`,
    runId,
    planId,
    planVersion,
    browserFactory
}) {
    const { chromium } = browserFactory || require('playwright');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const folder = path.join(outputRoot, runId);
    if (kind !== 'approval_read') await fs.mkdir(folder, { recursive: true });
    try {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            acceptDownloads: true,
            locale: 'vi-VN'
        });
        if (cookie)
            await context.addCookies([
                { name: 'omni_session', value: cookie, url: baseUrl, httpOnly: true }
            ]);
        const page = await context.newPage();
        if (credentials) {
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
            await page.getByRole('heading', { name: 'Đăng nhập Omni Studio' }).waitFor();
            await page.getByLabel('Email').fill(credentials.email);
            await page.getByLabel('Mật khẩu').fill(credentials.password);
            await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
            await page.getByText('Omni Workspace').first().waitFor({ timeout: 15000 });
        }
        const open = async (hash) => {
            await page.goto(`${baseUrl}/#${hash}`, { waitUntil: 'domcontentloaded' });
            await page.getByText('Omni Workspace').first().waitFor({ timeout: 15000 });
            if (await page.getByRole('button', { name: 'Đăng nhập' }).count())
                throw new Error('Phiên đăng nhập RPA không hợp lệ.');
        };
        if (kind === 'approval_read') {
            const result = await readApprovalPage(page, planId, planVersion, open);
            await context.close();
            return result;
        }
        if (kind === 'dashboard_screenshot') {
            await open('dashboard');
            await page.getByRole('heading', { name: 'Tổng quan' }).first().waitFor();
            await page.screenshot({ path: path.join(folder, 'dashboard.png'), fullPage: true });
        } else if (kind === 'weekly_csv') {
            for (const [hash, name] of [
                ['postInsights', 'post-insights.csv'],
                ['traffic', 'traffic.csv']
            ]) {
                await open(hash);
                const download = page.waitForEvent('download', { timeout: 15000 });
                await page.getByRole('button', { name: 'Xuất CSV' }).first().click();
                await (await download).saveAs(path.join(folder, name));
            }
        } else throw new Error('RPA_KIND_UNSUPPORTED');
        await context.close();
        return files[kind];
    } finally {
        await browser.close();
    }
}

function automationRouter(pool, options = {}) {
    const router = express.Router();
    let running = false;
    router.use((req, res, next) => {
        if (!pool) return res.status(503).json({ error: 'Cần PostgreSQL để chạy tự động hóa.' });
        if (!['admin', 'manager'].includes(req.actor?.role))
            return res.status(403).json({ error: 'Chỉ Admin/Manager được quản lý tự động hóa.' });
        next();
    });
    router.get('/status', async (_req, res) => {
        try {
            const [messages, runs] = await Promise.all([
                pool.query(
                    `SELECT m.id,m.kind,m.status,m.recipient_email,m.created_at,m.sent_at,
                            p.payload->>'name' AS plan_name,p.payload->>'scheduledAt' AS scheduled_at
                     FROM studio_automation_messages m JOIN publishing_plans p ON p.id=m.plan_id
                     ORDER BY m.created_at DESC LIMIT 50`
                ),
                pool.query(
                    'SELECT id,kind,status,plan_id,plan_version,read_at,artifact_name,error,created_at,finished_at FROM studio_rpa_runs ORDER BY created_at DESC LIMIT 20'
                )
            ]);
            res.json({ messages: messages.rows, runs: runs.rows });
        } catch {
            res.status(503).json({
                error: 'Chưa đọc được dữ liệu tự động hóa. Kiểm tra migration 013.'
            });
        }
    });
    router.post('/scan-reminders', async (_req, res) => {
        try {
            res.json({ queued: await scanApprovalReminders(pool) });
        } catch {
            res.status(503).json({ error: 'Chưa quét được các bài chờ duyệt.' });
        }
    });
    router.post('/rpa/:kind', async (req, res) => {
        const kind = req.params.kind;
        if (!kinds.has(kind)) return res.status(400).json({ error: 'Tác vụ RPA không hợp lệ.' });
        if (running) return res.status(409).json({ error: 'Một tác vụ RPA đang chạy.' });
        const cookie = /(?:^|;\s*)omni_session=([a-f0-9]{64})(?:;|$)/.exec(
            req.get('Cookie') || ''
        )?.[1];
        if (!cookie) return res.status(401).json({ error: 'Cần đăng nhập để chạy RPA.' });
        running = true;
        const id = randomUUID();
        try {
            await pool.query(
                "INSERT INTO studio_rpa_runs(id,kind,actor_id,status) VALUES($1,$2,$3,'running')",
                [id, kind, req.actor.id]
            );
            const artifacts = await (options.runBrowserJob || runBrowserJob)({
                kind,
                cookie,
                port: req.socket.localPort,
                runId: id
            });
            await pool.query(
                "UPDATE studio_rpa_runs SET status='success',artifact_name=$2,finished_at=now() WHERE id=$1",
                [id, artifacts.join(',')]
            );
            res.json({ id, kind, artifacts });
        } catch {
            await pool
                .query(
                    "UPDATE studio_rpa_runs SET status='failed',error='Không thể hoàn tất thao tác trình duyệt.',finished_at=now() WHERE id=$1",
                    [id]
                )
                .catch(() => {});
            res.status(503).json({
                error: 'RPA chưa chạy được. Kiểm tra Chrome, phiên đăng nhập và backend.'
            });
        } finally {
            running = false;
        }
    });
    router.get('/artifacts/:id/:name', async (req, res) => {
        if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.sendStatus(400);
        const row = (
            await pool.query('SELECT kind,status FROM studio_rpa_runs WHERE id=$1', [req.params.id])
        ).rows[0];
        if (!row || row.status !== 'success' || !files[row.kind]?.includes(req.params.name))
            return res.sendStatus(404);
        res.download(path.join(outputRoot, req.params.id, req.params.name));
    });
    return router;
}

module.exports = { automationRouter, scanApprovalReminders, readApprovalPage, runBrowserJob };

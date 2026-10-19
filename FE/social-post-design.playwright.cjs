// Run on demand with `node FE/social-post-design.playwright.cjs` against `npm run dev -- --port 5187`.
// Uses mocked API responses; it never contacts a social provider or database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const Omni = require('./public/domain.js');

const baseUrl = process.env.OMNI_UI_BASE_URL || 'http://127.0.0.1:5187';
const screenshotDir =
    process.env.OMNI_SCREENSHOT_DIR || path.join(os.tmpdir(), 'omni-social-post-design');
const originalPlan = {
    id: '8c981a03-70bd-4322-a778-d4671319f31a',
    name: 'Kế hoạch thử',
    tag: '',
    version: 1,
    status: 'scheduled',
    accountIds: ['facebook:123'],
    items: [
        { content: 'Bài chính cũ', image: '', kind: 'post', delayMinutes: 0 },
        { content: 'Bài nối tiếp cũ', image: '', kind: 'post', delayMinutes: 60 }
    ],
    timezone: 'Asia/Ho_Chi_Minh',
    repeat: 'none',
    repeatCount: 1,
    scheduledAt: '2026-10-20T03:00:00.000Z',
    deliveries: [
        {
            id: 'c90409b9-b803-4cec-91c5-cf4db4641c8a',
            account_id: 'facebook:123',
            item_index: 0,
            occurrence: 0,
            due_at: '2026-10-20T03:00:00.000Z',
            status: 'queued'
        }
    ]
};

async function installApiMocks(page, state) {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const reply = (body, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (url.pathname === '/api/auth/session')
            return reply({ user: { id: 'tester', name: 'Kiểm thử', role: 'admin' } });
        if (url.pathname === '/api/workspace')
            return reply({ mode: 'postgres', version: 1, data: Omni.emptyWorkspace() });
        if (url.pathname === '/api/records/tags')
            return reply({ items: [{ id: 'test-tag', name: 'Product launch' }] });
        if (url.pathname === '/api/social/accounts')
            return reply({
                accounts: [
                    {
                        id: 'facebook:123',
                        pageId: '123',
                        name: 'Page Kiểm thử',
                        platform: 'Facebook',
                        status: 'connected',
                        canPublish: true,
                        avatar: ''
                    }
                ],
                providers: [{ name: 'Facebook', supported: true }],
                oauthConfigured: false
            });
        if (url.pathname === '/api/publishing/status')
            return reply({ ready: true, workerEnabled: false });
        if (url.pathname === '/api/publishing/approvals')
            return reply({ items: [], counts: { pending: 0 } });
        if (url.pathname === '/api/publishing/plans' && request.method() === 'GET')
            return reply({ plans: [state.plan], nextOffset: null });
        if (url.pathname.includes('/api/social/accounts/') && url.pathname.endsWith('/posts'))
            return reply({ posts: [], nextCursor: null });
        if (
            url.pathname === `/api/publishing/plans/${state.plan.id}` &&
            request.method() === 'PUT'
        ) {
            const submitted = request.postDataJSON();
            state.saved = submitted;
            state.plan = {
                ...state.plan,
                ...submitted,
                version: state.plan.version + 1,
                deliveries: state.plan.deliveries.map((delivery) => ({
                    ...delivery,
                    due_at: submitted.scheduledAt,
                    status: 'queued'
                }))
            };
            return reply({ id: state.plan.id, version: state.plan.version });
        }
        if (url.pathname === `/api/publishing/plans/${state.plan.id}/cancel`) {
            const submitted = request.postDataJSON();
            assert.equal(submitted.version, state.plan.version);
            state.plan.status = 'cancelled';
            state.plan.version++;
            state.plan.cancellationReason = 'Đã hủy lịch theo yêu cầu';
            state.plan.deliveries = state.plan.deliveries.map((delivery) => ({
                ...delivery,
                status: 'cancelled'
            }));
            return reply({ id: state.plan.id, version: state.plan.version });
        }
        return reply({ error: `Unexpected mocked API: ${request.method()} ${url.pathname}` }, 404);
    });
}

async function openScheduledPost(page) {
    await page.goto(`${baseUrl}/#calendar`);
    await page.getByRole('button', { name: 'Kỳ sau' }).click();
    await page.locator('.planner-event-content').filter({ hasText: 'Bài chính cũ' }).click();
    await page.getByRole('dialog', { name: 'Chỉnh sửa kế hoạch nội dung' }).waitFor();
}

async function main() {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const browser = await chromium.launch({
        executablePath:
            process.env.OMNI_CHROME_PATH ||
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    const state = { plan: structuredClone(originalPlan), saved: null };
    try {
        const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await installApiMocks(desktop, state);
        await openScheduledPost(desktop);
        await desktop.screenshot({ path: path.join(screenshotDir, 'desktop-editor-before.png') });

        await desktop.getByLabel('Nội dung bài viết').fill('Bài chính đã sửa');
        await desktop.getByLabel('Nội dung nối tiếp 1').fill('Bài nối tiếp đã sửa');
        await desktop.locator('summary[aria-label="Chọn tag đã dùng"]').click();
        await desktop.screenshot({ path: path.join(screenshotDir, 'desktop-tag-picker.png') });
        await desktop.getByRole('button', { name: '#Product launch' }).click();
        await desktop.getByLabel('Ngày đăng').fill('2026-10-21');
        await desktop.getByLabel('Giờ đăng', { exact: true }).fill('10:30');
        await desktop.getByLabel('Lặp lại').selectOption({ label: 'Mỗi tuần' });
        await desktop.getByLabel('Số lượt lặp (tối đa 30)').fill('2');
        await desktop.screenshot({ path: path.join(screenshotDir, 'desktop-editor-changed.png') });
        assert.match(await desktop.locator('.social-content').innerText(), /Bài chính đã sửa/);
        assert.match(
            await desktop.locator('.studio-preview-followup').first().innerText(),
            /Bài nối tiếp đã sửa/
        );

        await desktop.getByRole('button', { name: 'Lưu thay đổi' }).click();
        await desktop
            .getByRole('dialog', { name: 'Chỉnh sửa kế hoạch nội dung' })
            .waitFor({ state: 'hidden' });
        await desktop.getByText('Đã cập nhật lịch đăng.').waitFor();
        assert.equal(state.saved.tag, 'Product launch');
        assert.equal(state.saved.repeat, 'weekly');
        assert.equal(state.saved.repeatCount, 2);
        assert.equal(state.saved.items[1].content, 'Bài nối tiếp đã sửa');
        assert.equal(state.saved.scheduledAt, '2026-10-21T03:30:00.000Z');
        if (
            !(await desktop
                .locator('.planner-event-content')
                .filter({ hasText: 'Bài chính đã sửa' })
                .count())
        )
            await desktop.getByRole('button', { name: 'Kỳ sau' }).click();
        await desktop.screenshot({ path: path.join(screenshotDir, 'desktop-rescheduled.png') });

        await desktop
            .locator('.planner-event-content')
            .filter({ hasText: 'Bài chính đã sửa' })
            .click();
        assert.equal(
            await desktop.getByRole('combobox', { name: 'Tag nội dung' }).inputValue(),
            'Product launch'
        );
        assert.equal(await desktop.getByLabel('Lặp lại').inputValue(), 'Mỗi tuần');
        assert.equal(await desktop.getByLabel('Ngày đăng').inputValue(), '2026-10-21');
        await desktop
            .getByRole('dialog', { name: 'Chỉnh sửa kế hoạch nội dung' })
            .getByRole('button', { name: 'Đóng' })
            .click();

        const card = desktop
            .locator('.planner-event')
            .filter({ hasText: 'Bài chính đã sửa' })
            .first();
        await card.locator('summary').click();
        await card.getByRole('button', { name: 'Hủy lịch còn chờ' }).click();
        await desktop.getByRole('dialog', { name: 'Hủy lịch còn chờ?' }).waitFor();
        await desktop.evaluate(() => window.dispatchEvent(new Event('publishing-plans-changed')));
        await desktop.getByText('PostgreSQL · Worker đang tắt', { exact: false }).waitFor();
        assert.equal(
            await desktop.getByRole('dialog', { name: 'Hủy lịch còn chờ?' }).isVisible(),
            true,
            'background calendar refresh keeps the confirmation open'
        );
        await desktop.screenshot({ path: path.join(screenshotDir, 'desktop-cancel-confirm.png') });
        await desktop.getByRole('button', { name: 'Xác nhận hủy lịch' }).click();
        await desktop
            .getByText('Đã hủy các lượt còn chờ. Kế hoạch và lịch sử vẫn được lưu.')
            .waitFor();
        assert.equal(state.plan.status, 'cancelled');
        await desktop
            .getByRole('button', { name: /Đã hủy/ })
            .first()
            .click();
        await desktop.getByText('Bài chính đã sửa').waitFor();
        await desktop.screenshot({ path: path.join(screenshotDir, 'desktop-cancelled.png') });

        const mobileState = { plan: structuredClone(originalPlan), saved: null };
        const mobile = await browser.newPage({
            viewport: { width: 390, height: 844 },
            isMobile: true
        });
        await installApiMocks(mobile, mobileState);
        await openScheduledPost(mobile);
        await mobile.screenshot({ path: path.join(screenshotDir, 'mobile-editor.png') });
        await mobile.locator('.studio-preview').scrollIntoViewIfNeeded();
        await mobile.screenshot({ path: path.join(screenshotDir, 'mobile-preview.png') });
        const overflow = await mobile.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        assert.equal(overflow, false, 'mobile page has horizontal overflow');
        console.log(`Playwright flow passed. Screenshots: ${screenshotDir}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

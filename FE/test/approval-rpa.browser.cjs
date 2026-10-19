const test = require('node:test');
const assert = require('node:assert/strict');

test(
    'approval deep link and UI detail work on desktop and mobile',
    { skip: !process.env.APPROVAL_RPA_BROWSER_TEST },
    async () => {
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        const id = 'a70bf857-f646-49f3-a56d-d3595e5a3a27';
        const base = process.env.APPROVAL_RPA_BROWSER_URL || 'http://127.0.0.1:5174';
        const approval = {
            id,
            version: 3,
            status: 'pending',
            name: 'Bài demo chờ duyệt',
            createdByName: 'Editor Demo',
            accountIds: ['facebook:123'],
            scheduledAt: '2026-10-20T02:00:00.000Z',
            items: [{ content: 'Nội dung demo để quản lý đọc.' }],
            deliveryCount: 0,
            publishedCount: 0,
            isLocked: false
        };
        const targetedRequests = [];
        let unfilteredRequests = 0;
        try {
            for (const viewport of [
                { width: 1440, height: 900 },
                { width: 390, height: 844 }
            ]) {
                const page = await browser.newPage({ viewport });
                const errors = [];
                page.on('pageerror', (error) => errors.push(error.message));
                await page.route('**/api/**', async (route) => {
                    const url = new URL(route.request().url());
                    const send = (body, status = 200) =>
                        route.fulfill({
                            status,
                            contentType: 'application/json',
                            body: JSON.stringify(body)
                        });
                    if (url.pathname === '/api/auth/session')
                        return send({
                            user: { id: 'manager-1', name: 'Manager Demo', role: 'manager' }
                        });
                    if (url.pathname === '/api/workspace')
                        return send({ mode: 'demo', version: 0 });
                    if (url.pathname === '/api/social/accounts')
                        return send({
                            accounts: [
                                {
                                    id: 'facebook:123',
                                    name: 'Page Demo',
                                    platform: 'Facebook',
                                    status: 'connected'
                                }
                            ],
                            providers: []
                        });
                    if (url.pathname === '/api/publishing/approvals') {
                        if (url.searchParams.get('planId'))
                            targetedRequests.push(url.searchParams.get('planId'));
                        else unfilteredRequests++;
                        return send({
                            items: [approval],
                            counts: { pending: 1, scheduled: 0, rejected: 0 },
                            nextOffset: null
                        });
                    }
                    return send({ error: 'Fixture không có API này.' }, 404);
                });
                await page.goto(`${base}/#posts/approvals/${id}`);
                await page.getByRole('heading', { name: 'Duyệt bài viết' }).waitFor();
                await page
                    .getByRole('button', { name: /Chưa duyệt/ })
                    .first()
                    .click();
                const row = page.locator(`tr[data-plan-id="${id}"]`);
                await row.waitFor();
                await row.getByRole('button', { name: 'Xem chi tiết' }).click();
                const dialog = page.getByRole('dialog', { name: 'Chi tiết bài duyệt' });
                await dialog.waitFor();
                assert.equal(await dialog.getByTestId('approval-plan-id').innerText(), id);
                assert.equal(await dialog.getByTestId('approval-plan-version').innerText(), '3');
                assert.equal(
                    await dialog.getByTestId('approval-creator').innerText(),
                    'Editor Demo'
                );
                assert.equal(await dialog.getByTestId('approval-pages').innerText(), 'Page Demo');
                assert.equal(
                    await dialog.getByTestId('approval-content').innerText(),
                    'Nội dung demo để quản lý đọc.'
                );
                await dialog.getByRole('button', { name: 'Đóng' }).click();
                const beforeAll = unfilteredRequests;
                const reloaded = page.waitForResponse((response) => {
                    const url = new URL(response.url());
                    return (
                        url.pathname === '/api/publishing/approvals' &&
                        !url.searchParams.has('planId')
                    );
                });
                await page.getByRole('button', { name: 'Xem tất cả bài' }).click();
                await reloaded;
                await page.waitForFunction(() => location.hash === '#posts/approvals');
                assert.ok(unfilteredRequests > beforeAll);
                assert.deepEqual(errors, []);
                await page.close();
            }
            assert.ok(targetedRequests.includes(id));
        } finally {
            await browser.close();
        }
    }
);

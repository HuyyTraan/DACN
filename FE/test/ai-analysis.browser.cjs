const test = require('node:test');
const assert = require('node:assert/strict');

test(
    'AI Analysis nhập liệu, căn cứ và bố cục desktop/mobile',
    {
        skip: !process.env.AI_ANALYSIS_BROWSER_TEST
    },
    async () => {
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        const base = process.env.AI_ANALYSIS_BROWSER_URL || 'http://127.0.0.1:5174';
        const requests = [];
        const fixture = {
            import: {
                id: 'import-1',
                pageId: '123',
                periodStart: '2026-10-01',
                periodEnd: '2026-10-07',
                source: 'manual',
                rows: [{ providerPostId: '123_456', text: 'Bài thử nghiệm' }]
            },
            kpis: { postCount: { value: 1, unit: 'bài', reason: null } },
            facts: [
                {
                    id: 'F1',
                    label: 'Tương tác / reach',
                    value: 10,
                    unit: '%',
                    reason: null,
                    providerPostId: '123_456',
                    periodStart: '2026-10-01',
                    periodEnd: '2026-10-07',
                    definition: '10 / 100 × 100'
                }
            ],
            limitations: ['Chỉ có một bài được chọn.'],
            aiPayload: {
                scope: { pageId: 'selected-page' },
                facts: [{ id: 'F1', value: 10 }],
                posts: [{ providerPostId: 'P1' }]
            },
            aiPayloadWithText: {
                scope: { pageId: 'selected-page' },
                facts: [{ id: 'F1', value: 10 }],
                posts: [{ providerPostId: 'P1', text: 'Bài thử nghiệm' }]
            }
        };
        const analysis = {
            id: 'run-1',
            importId: 'import-1',
            pageId: '123',
            periodStart: '2026-10-01',
            periodEnd: '2026-10-07',
            status: 'completed',
            createdAt: '2026-10-18T00:00:00Z',
            kpis: fixture.kpis,
            facts: fixture.facts,
            limitations: fixture.limitations,
            report: {
                summary: 'Tỷ lệ tương tác của bài được chọn là 10%.',
                findings: [{ explanation: 'Tương tác đạt 10%.', factIds: ['F1'] }],
                recommendations: [
                    {
                        action: 'Thử CTA rõ hơn',
                        rationale: 'Có thể so kết quả kỳ sau.',
                        expectedObservation: 'Tỷ lệ tương tác kỳ sau',
                        factIds: ['F1']
                    }
                ],
                limitations: fixture.limitations
            }
        };
        try {
            for (const viewport of [
                { width: 1440, height: 900 },
                { width: 390, height: 844 }
            ]) {
                const page = await browser.newPage({ viewport });
                page.on('pageerror', (error) => {
                    throw error;
                });
                await page.route('**/api/**', async (route) => {
                    const path = new URL(route.request().url()).pathname;
                    const method = route.request().method();
                    if (method === 'POST')
                        requests.push({ path, body: route.request().postDataJSON() });
                    const send = (body, status = 200) =>
                        route.fulfill({
                            status,
                            contentType: 'application/json',
                            body: JSON.stringify(body)
                        });
                    if (path === '/api/auth/session')
                        return send({ user: { id: 'user-1', name: 'Manager', role: 'manager' } });
                    if (path === '/api/workspace') return send({ mode: 'demo', version: 0 });
                    if (path === '/api/social/accounts')
                        return send({
                            accounts: [
                                {
                                    id: 'account-1',
                                    pageId: '123',
                                    name: 'Page thử nghiệm',
                                    platform: 'Facebook'
                                }
                            ],
                            providers: []
                        });
                    if (path === '/api/ai/status')
                        return send({
                            ready: true,
                            providerConfigured: true,
                            freeTierOnly: true,
                            budgetConfigured: false,
                            remainingToday: 8,
                            remainingBudgetVnd: null
                        });
                    if (path === '/api/ai/analyses' && method === 'GET')
                        return send({ items: [], total: 0 });
                    if (path === '/api/ai/imports' && method === 'POST') return send(fixture, 201);
                    if (path === '/api/ai/analyses' && method === 'POST')
                        return send({ analysis }, 201);
                    return send({ error: 'Not part of this UI fixture' }, 404);
                });
                await page.goto(`${base}/#aiAnalysis`);
                await page.getByRole('heading', { name: 'Chọn Page và kỳ đo' }).waitFor();
                await page.getByLabel('Post ID bài 1').fill('123_456');
                await page.getByLabel('reach bài 1').fill('100');
                await page.getByLabel('interactions bài 1').fill('10');
                await page.getByRole('button', { name: 'Lưu số liệu & tính KPI' }).click();
                await page.getByText('Tỷ lệ tương tác / reach').waitFor();
                assert.equal(await page.getByText('selected-page').count(), 1);
                assert.equal(await page.getByText('Bài thử nghiệm').count(), 0);
                await page.getByRole('button', { name: 'Yêu cầu AI phân tích' }).click();
                await page.getByText('Tương tác đạt 10%.').waitFor();
                await page.getByText('xem căn cứ').first().click();
                await page.getByText('Mã fact: F1').first().waitFor();
                if (process.env.AI_ANALYSIS_SCREENSHOT_DIR) {
                    await page.screenshot({
                        path: require('node:path').join(
                            process.env.AI_ANALYSIS_SCREENSHOT_DIR,
                            `ai-analysis-${viewport.width}.png`
                        ),
                        fullPage: true
                    });
                }
                const overflow = await page.evaluate(() => ({
                    width: document.documentElement.scrollWidth,
                    viewport: innerWidth,
                    offenders: [...document.querySelectorAll('*')]
                        .filter((element) => element.getBoundingClientRect().right > innerWidth + 2)
                        .slice(0, 12)
                        .map(
                            (element) =>
                                `${element.tagName}.${element.className}=${Math.round(element.getBoundingClientRect().right)}`
                        )
                }));
                assert.equal(
                    overflow.width <= overflow.viewport,
                    true,
                    `Horizontal page overflow at ${viewport.width}px: ${JSON.stringify(overflow)}`
                );
                if (viewport.width === 1440) {
                    const file = page.locator('.ai-file-button input[type="file"]');
                    await file.setInputFiles({
                        name: 'duplicate.csv',
                        mimeType: 'text/csv',
                        buffer: Buffer.from('providerPostId,reach\n123_456,100\n123_456,200')
                    });
                    await page.getByText('trùng hoặc chồng kỳ').waitFor();
                    assert.equal(
                        await page
                            .getByRole('button', { name: 'Lưu số liệu & tính KPI' })
                            .isDisabled(),
                        true
                    );
                    await file.setInputFiles({
                        name: 'lifetime.csv',
                        mimeType: 'text/csv',
                        buffer: Buffer.from(
                            'providerPostId,measurementType,reach\n123_456,lifetime,100'
                        )
                    });
                    await page.getByText('snapshot lifetime không dùng được').waitFor();
                    assert.equal(
                        await page
                            .getByRole('button', { name: 'Lưu số liệu & tính KPI' })
                            .isDisabled(),
                        true
                    );
                    await file.setInputFiles({
                        name: 'valid.csv',
                        mimeType: 'text/csv',
                        buffer: Buffer.from(
                            'providerPostId,reach,impressions,interactions,linkClicks,text\n123_456,100,150,10,2,"CTA, mới"\n123_789,200,240,18,3,'
                        )
                    });
                    await page.getByText('2/30 bài').waitFor();
                    await page.getByRole('button', { name: 'Lưu số liệu & tính KPI' }).click();
                    await page.getByRole('checkbox', { name: /Gửi nội dung của các bài/ }).check();
                    await page.getByText('Bài thử nghiệm').first().waitFor();
                    await page.getByRole('button', { name: 'Yêu cầu AI phân tích' }).click();
                    assert.equal(requests.at(-2).body.source, 'csv');
                    assert.equal(requests.at(-2).body.rows.length, 2);
                    assert.equal(requests.at(-1).body.includeText, true);
                }
                await page.close();
            }
            assert.equal(requests.filter((entry) => entry.path === '/api/ai/analyses').length, 3);
            assert.equal(
                requests.find((entry) => entry.path === '/api/ai/analyses').body.includeText,
                false
            );
        } finally {
            await browser.close();
        }
    }
);

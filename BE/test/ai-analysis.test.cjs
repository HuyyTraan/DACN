const test = require('node:test');
const assert = require('node:assert/strict');
const { validateImport, calculate } = require('../server/ai-metrics');
const {
    FREE_TIER_MODEL,
    createGeminiProvider,
    validateReport,
    payloadFor
} = require('../server/ai-provider');

const valid = () => ({
    pageId: 'page-1',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-07',
    timezone: 'Asia/Ho_Chi_Minh',
    source: 'csv',
    sourceLabel: 'Export được phép',
    rows: [
        {
            providerPostId: 'post-1',
            reach: 100,
            impressions: 200,
            interactions: 10,
            linkClicks: 4,
            text: 'Mời liên hệ x@example.com'
        }
    ]
});

test('measured period KPI and fact references are deterministic', () => {
    const data = validateImport(valid());
    const { kpis, facts } = calculate(data);
    assert.equal(kpis.interactionRateByReach.value, 10);
    assert.equal(kpis.linkCTR.value, 2);
    assert.equal(facts.find((fact) => fact.id === 'P1_interactionRateByReach').value, 10);
    assert.equal(
        facts.find((fact) => fact.id === 'TOTAL_reach').definition.includes('không khử trùng'),
        true
    );
    const preview = payloadFor(data, calculate(data), false);
    assert.equal(preview.posts[0].text, undefined);
    const withText = payloadFor(data, calculate(data), true);
    assert.doesNotMatch(withText.posts[0].text, /x@example.com/);
    const secret = valid();
    secret.rows[0].text =
        'Cookie: session=abc123\nBearer secret123 access_token=abc password=hunter2';
    const redacted = payloadFor(validateImport(secret), calculate(validateImport(secret)), true);
    assert.doesNotMatch(redacted.posts[0].text, /abc123|secret123|hunter2/);
});

test('missing and zero denominator return null with reasons', () => {
    const input = valid();
    input.rows[0].reach = 0;
    input.rows[0].impressions = null;
    const { kpis, facts } = calculate(validateImport(input));
    assert.equal(kpis.interactionRateByReach.value, null);
    assert.match(kpis.interactionRateByReach.reason, /0/);
    assert.equal(kpis.linkCTR.value, null);
    assert.match(facts.find((fact) => fact.id === 'P1_linkCTR').reason, /Thiếu/);
});

test('rejects lifetime, duplicate and overlapping periods', () => {
    const lifetime = valid();
    lifetime.measurementType = 'lifetime';
    assert.throws(() => validateImport(lifetime), /lifetime/);
    const duplicate = valid();
    duplicate.rows.push({ ...duplicate.rows[0] });
    assert.throws(() => validateImport(duplicate), /trùng hoặc chồng kỳ/);
    duplicate.rows[1].periodStart = '2026-10-05';
    assert.throws(() => validateImport(duplicate), /trùng hoặc chồng kỳ/);
});

test('rejects malformed metrics and incompatible definitions', () => {
    const input = valid();
    input.rows[0].reach = -1;
    assert.throws(() => validateImport(input), /không âm/);
    input.rows[0].reach = 1;
    input.metricDefinitionVersion = 'lifetime-v1';
    assert.throws(() => validateImport(input), /không tương thích/);
    delete input.metricDefinitionVersion;
    input.rows[0].metricDefinitionVersion = 'other-definition';
    assert.throws(() => validateImport(input), /không tương thích/);
});

test('rejects rows outside selected period and more than 30 posts', () => {
    const outside = valid();
    outside.rows[0].periodStart = '2026-09-30';
    assert.throws(() => validateImport(outside), /ngoài kỳ báo cáo/);
    const tooMany = valid();
    tooMany.rows = Array.from({ length: 31 }, (_, index) => ({
        providerPostId: `post-${index}`,
        reach: 100,
        impressions: 200,
        interactions: 10
    }));
    assert.throws(() => validateImport(tooMany), /1 đến 30/);
});

test('provider adapter sends documented structured output and records usage', async () => {
    let request;
    const provider = createGeminiProvider(
        {
            AI_GEMINI_API_KEY: 'fake-key',
            AI_GEMINI_MODEL: 'gemini-test',
            AI_GEMINI_FREE_TIER_ONLY: 'false',
            AI_TIMEOUT_MS: '1000'
        },
        async (url, options) => {
            request = { url, options };
            return {
                ok: true,
                json: async () => ({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: JSON.stringify({
                                            summary: 'Tóm tắt',
                                            findings: [],
                                            recommendations: [],
                                            limitations: []
                                        })
                                    }
                                ]
                            }
                        }
                    ],
                    usageMetadata: {
                        promptTokenCount: 20,
                        candidatesTokenCount: 30,
                        totalTokenCount: 50
                    }
                })
            };
        }
    );
    const result = await provider.generate({ facts: [] });
    assert.equal(result.usage.totalTokens, 50);
    assert.match(request.url, /gemini-test:generateContent/);
    const body = JSON.parse(request.options.body);
    assert.equal(body.generationConfig.responseFormat.text.mimeType, 'application/json');
    assert.equal(body.tools, undefined);
    assert.equal(request.options.headers['x-goog-api-key'], 'fake-key');
});

test('free-tier mode defaults to Flash-Lite and rejects another model', async () => {
    const free = createGeminiProvider({ AI_GEMINI_API_KEY: 'fake-key' });
    assert.equal(free.model, FREE_TIER_MODEL);
    assert.equal(free.configured, true);
    const other = createGeminiProvider({
        AI_GEMINI_API_KEY: 'fake-key',
        AI_GEMINI_MODEL: 'gemini-test'
    });
    assert.equal(other.configured, false);
    await assert.rejects(other.generate({ facts: [] }), /chưa được cấu hình/);
});

test('rejects fabricated or null fact references and malformed output', () => {
    const facts = [
        { id: 'F1', value: 10 },
        { id: 'F2', value: null }
    ];
    const report = {
        summary: 'Tóm tắt',
        findings: [{ explanation: 'Nhận xét', factIds: ['missing'] }],
        recommendations: [],
        limitations: []
    };
    assert.throws(() => validateReport(report, facts), /căn cứ/);
    report.findings[0].factIds = ['F2'];
    assert.throws(() => validateReport(report, facts), /căn cứ/);
    report.findings[0].factIds = ['F1'];
    assert.equal(validateReport(report, facts), report);
    report.recommendations = Array(4).fill({
        action: 'A',
        rationale: 'B',
        factIds: ['F1'],
        expectedObservation: 'C'
    });
    assert.throws(() => validateReport(report, facts), /cấu trúc/);
});

test('provider timeout is surfaced without retry', async () => {
    let calls = 0;
    const provider = createGeminiProvider(
        { AI_GEMINI_API_KEY: 'fake-key', AI_TIMEOUT_MS: '1000' },
        async (url, options) => {
            calls++;
            await new Promise((resolve, reject) =>
                options.signal.addEventListener('abort', () =>
                    reject(Object.assign(new Error('abort'), { name: 'AbortError' }))
                )
            );
        }
    );
    await assert.rejects(provider.generate({ facts: [] }), /quá thời gian/);
    assert.equal(calls, 1);
});

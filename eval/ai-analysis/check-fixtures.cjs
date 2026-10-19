const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateImport, calculate } = require('../../BE/server/ai-metrics');

const columns = [
    'providerPostId',
    'periodStart',
    'periodEnd',
    'timezone',
    'reach',
    'impressions',
    'interactions',
    'linkClicks',
    'text'
];
const numeric = new Set(['reach', 'impressions', 'interactions', 'linkClicks']);

for (let index = 1; index <= 10; index++) {
    const name = `V${String(index).padStart(2, '0')}`;
    const lines = fs
        .readFileSync(path.join(__dirname, `${name}.csv`), 'utf8')
        .trim()
        .split(/\r?\n/);
    assert.deepEqual(lines.shift().split(','), columns, `${name} header`);
    const rows = lines.map((line) =>
        Object.fromEntries(
            line
                .split(',')
                .map((value, position) => [
                    columns[position],
                    numeric.has(columns[position]) ? (value === '' ? null : Number(value)) : value
                ])
        )
    );
    const data = validateImport({
        pageId: `eval_page_${name}`,
        periodStart: rows[0].periodStart,
        periodEnd: rows[0].periodEnd,
        timezone: rows[0].timezone,
        source: 'demo',
        sourceLabel: `Tổng hợp ${name}`,
        rows
    });
    const { kpis, facts } = calculate(data);
    assert.equal(kpis.postCount.value, rows.length, `${name} post count`);
    assert.equal(facts.filter((fact) => fact.id.startsWith('P')).length, rows.length * 6);
    if (name === 'V04') {
        const zero = facts.find((fact) => fact.id === 'P1_interactionRateByReach');
        assert.equal(zero.value, null);
        assert.match(zero.reason, /0/);
    }
    if (name === 'V05') {
        assert.equal(kpis.linkCTR.value, null);
        assert.match(kpis.linkCTR.reason, /Thiếu/);
    }
    const display = (metric) =>
        metric.value == null ? `chưa tính được (${metric.reason})` : `${metric.value.toFixed(2)}%`;
    console.log(
        `${name} baseline: Trong ${rows.length} bài được chọn, tương tác/tổng reach bài ` +
            `${display(kpis.interactionRateByReach)}; link CTR ${display(kpis.linkCTR)}. ` +
            'Đây là mô tả số liệu, không chứng minh nguyên nhân hoặc hiệu quả toàn Page.'
    );
}

const VERSION = 'page-post-period-v1';
const ZONES = new Set(['Asia/Ho_Chi_Minh', 'Asia/Singapore', 'UTC']);

class AiInputError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

function date(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new AiInputError(`${label} phải có dạng YYYY-MM-DD.`);
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
        throw new AiInputError(`${label} không hợp lệ.`);
    return value;
}

function text(value, label, max, required = false) {
    if (value == null || value === '') {
        if (required) throw new AiInputError(`${label} là bắt buộc.`);
        return '';
    }
    if (typeof value !== 'string' || !value.trim() || value.length > max)
        throw new AiInputError(`${label} không hợp lệ (tối đa ${max} ký tự).`);
    return value.trim();
}

function count(value, label) {
    if (value == null || value === '') return null;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        throw new AiInputError(`${label} phải là số nguyên không âm.`);
    return value;
}

function validateImport(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new AiInputError('Dữ liệu nhập không hợp lệ.');
    const pageId = text(input.pageId, 'Page ID', 120, true);
    if (!/^[A-Za-z0-9_.:-]+$/.test(pageId)) throw new AiInputError('Page ID không hợp lệ.');
    const periodStart = date(input.periodStart, 'Ngày bắt đầu');
    const periodEnd = date(input.periodEnd, 'Ngày kết thúc');
    if (periodStart > periodEnd) throw new AiInputError('Kỳ đo không hợp lệ.');
    if (!ZONES.has(input.timezone)) throw new AiInputError('Múi giờ không được hỗ trợ.');
    if (!['manual', 'csv', 'demo'].includes(input.source))
        throw new AiInputError('Nguồn dữ liệu không hợp lệ.');
    if (input.metricDefinitionVersion && input.metricDefinitionVersion !== VERSION)
        throw new AiInputError('Định nghĩa chỉ số không tương thích.');
    if (input.measurementType && input.measurementType !== 'period')
        throw new AiInputError('Chỉ nhận số liệu đo theo kỳ, không nhận snapshot lifetime.');
    if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 30)
        throw new AiInputError('Chọn từ 1 đến 30 bài cho mỗi lần nhập.');
    const rows = input.rows.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            throw new AiInputError(`Dòng ${index + 1} không hợp lệ.`);
        if (item.measurementType && item.measurementType !== 'period')
            throw new AiInputError(`Dòng ${index + 1} là snapshot lifetime, không dùng được.`);
        if (item.metricDefinitionVersion && item.metricDefinitionVersion !== VERSION)
            throw new AiInputError(`Định nghĩa chỉ số dòng ${index + 1} không tương thích.`);
        const row = {
            providerPostId: text(item.providerPostId, `Post ID dòng ${index + 1}`, 160, true),
            periodStart: date(item.periodStart || periodStart, `Ngày bắt đầu dòng ${index + 1}`),
            periodEnd: date(item.periodEnd || periodEnd, `Ngày kết thúc dòng ${index + 1}`),
            timezone: item.timezone || input.timezone,
            reach: count(item.reach, `Reach dòng ${index + 1}`),
            impressions: count(item.impressions, `Impressions dòng ${index + 1}`),
            interactions: count(item.interactions, `Interactions dòng ${index + 1}`),
            linkClicks: count(item.linkClicks, `Link clicks dòng ${index + 1}`),
            text:
                item.text == null || item.text === ''
                    ? ''
                    : text(item.text, `Nội dung dòng ${index + 1}`, 1000)
        };
        if (!/^[A-Za-z0-9_.:-]+$/.test(row.providerPostId))
            throw new AiInputError(`Post ID dòng ${index + 1} không hợp lệ.`);
        if (
            row.periodStart > row.periodEnd ||
            row.periodStart < periodStart ||
            row.periodEnd > periodEnd
        )
            throw new AiInputError(`Kỳ đo dòng ${index + 1} nằm ngoài kỳ báo cáo.`);
        if (!ZONES.has(row.timezone) || row.timezone !== input.timezone)
            throw new AiInputError(`Múi giờ dòng ${index + 1} không khớp.`);
        return row;
    });
    for (let i = 0; i < rows.length; i++)
        for (let j = 0; j < i; j++)
            if (
                rows[i].providerPostId === rows[j].providerPostId &&
                rows[i].periodStart <= rows[j].periodEnd &&
                rows[j].periodStart <= rows[i].periodEnd
            )
                throw new AiInputError('Có số liệu trùng hoặc chồng kỳ cho cùng bài viết.', 409);
    return {
        pageId,
        periodStart,
        periodEnd,
        timezone: input.timezone,
        source: input.source,
        sourceLabel: text(input.sourceLabel, 'Tên nguồn', 120),
        metricDefinitionVersion: VERSION,
        rows
    };
}

function metric(value, unit, reason = null) {
    return { value, unit, reason };
}

function calculate(data) {
    const facts = [];
    const limitations = [
        `Báo cáo chỉ gồm ${data.rows.length} bài được chọn, không đại diện toàn Page.`,
        'Tổng reach theo bài có thể trùng người và không phải unique reach của Page.'
    ];
    const totals = { reach: 0, impressions: 0, interactions: 0, linkClicks: 0 };
    const complete = { reach: true, impressions: true, interactions: true, linkClicks: true };
    data.rows.forEach((row, index) => {
        const base = `P${index + 1}`;
        for (const key of Object.keys(totals)) {
            if (row[key] == null) complete[key] = false;
            else totals[key] += row[key];
            facts.push({
                id: `${base}_${key}`,
                label: `${key} · ${row.providerPostId}`,
                value: row[key],
                unit: 'lượt',
                reason: row[key] == null ? 'Chưa có số liệu cùng kỳ.' : null,
                providerPostId: row.providerPostId,
                periodStart: row.periodStart,
                periodEnd: row.periodEnd,
                definition: `${key} của bài trong kỳ đo; nguồn ${data.source}.`
            });
        }
        const rates = [
            ['interactionRateByReach', row.interactions, row.reach, 'Tương tác / reach × 100'],
            ['linkCTR', row.linkClicks, row.impressions, 'Nhấp liên kết / impressions × 100']
        ];
        for (const [key, numerator, denominator, definition] of rates) {
            const reason =
                numerator == null || denominator == null
                    ? 'Thiếu tử số hoặc mẫu số cùng kỳ.'
                    : denominator === 0
                      ? 'Mẫu số bằng 0.'
                      : null;
            facts.push({
                id: `${base}_${key}`,
                label: `${key} · ${row.providerPostId}`,
                value: reason ? null : (numerator / denominator) * 100,
                unit: '%',
                reason,
                providerPostId: row.providerPostId,
                periodStart: row.periodStart,
                periodEnd: row.periodEnd,
                definition
            });
        }
    });
    const aggregate = (key, label, unit, definition) => {
        const reason = complete[key] ? null : 'Một hoặc nhiều bài thiếu số liệu cùng kỳ.';
        facts.push({
            id: `TOTAL_${key}`,
            label,
            value: reason ? null : totals[key],
            unit,
            reason,
            providerPostId: null,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            definition
        });
        return metric(reason ? null : totals[key], unit, reason);
    };
    const kpis = {
        postCount: metric(data.rows.length, 'bài'),
        postReachSum: aggregate(
            'reach',
            'Tổng reach theo bài',
            'lượt',
            'Cộng reach từng bài; không khử trùng người.'
        ),
        impressionsSum: aggregate(
            'impressions',
            'Tổng impressions',
            'lượt',
            'Cộng impressions theo bài.'
        ),
        interactionsSum: aggregate(
            'interactions',
            'Tổng tương tác',
            'lượt',
            'Cộng interactions theo bài.'
        ),
        linkClicksSum: aggregate(
            'linkClicks',
            'Tổng nhấp liên kết',
            'lượt',
            'Cộng linkClicks theo bài.'
        )
    };
    for (const [key, numerator, denominator, label, definition] of [
        [
            'interactionRateByReach',
            kpis.interactionsSum,
            kpis.postReachSum,
            'Tỷ lệ tương tác / tổng reach bài',
            'Tổng tương tác / tổng reach theo bài × 100; reach không khử trùng.'
        ],
        [
            'linkCTR',
            kpis.linkClicksSum,
            kpis.impressionsSum,
            'Link CTR',
            'Tổng nhấp liên kết / tổng impressions × 100.'
        ]
    ]) {
        const reason =
            numerator.value == null || denominator.value == null
                ? 'Thiếu tử số hoặc mẫu số cùng kỳ.'
                : denominator.value === 0
                  ? 'Mẫu số bằng 0.'
                  : null;
        kpis[key] = metric(
            reason ? null : (numerator.value / denominator.value) * 100,
            '%',
            reason
        );
        facts.push({
            id: `TOTAL_${key}`,
            label,
            ...kpis[key],
            providerPostId: null,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            definition
        });
    }
    if (facts.some((fact) => fact.reason))
        limitations.push('Một số chỉ số thiếu dữ liệu hoặc mẫu số bằng 0.');
    return { kpis, facts, limitations };
}

module.exports = { VERSION, AiInputError, validateImport, calculate };

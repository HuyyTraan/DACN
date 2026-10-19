import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileUp, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { useWorkspace } from './App.jsx';
import { apiFetch } from './Auth.jsx';
import { Button, exportRows } from './components.jsx';

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const CSV_COLUMNS = [
    'providerPostId',
    'periodStart',
    'periodEnd',
    'timezone',
    'measurementType',
    'reach',
    'impressions',
    'interactions',
    'linkClicks',
    'text'
];
const NUMBERS = ['reach', 'impressions', 'interactions', 'linkClicks'];
const TIMEZONES = ['Asia/Ho_Chi_Minh', 'Asia/Singapore', 'UTC'];
const KPI_LABELS = {
    postCount: 'Số bài đã chọn',
    postReachSum: 'Tổng reach theo bài',
    impressionsSum: 'Tổng lượt hiển thị',
    interactionsSum: 'Tổng tương tác',
    linkClicksSum: 'Tổng nhấp liên kết',
    interactionRateByReach: 'Tỷ lệ tương tác / reach',
    linkCTR: 'Tỷ lệ nhấp / hiển thị'
};
const analysisStatus = (status) =>
    ({ completed: 'Hoàn thành', failed: 'AI thất bại', reserved: 'Đang xử lý' })[status] ||
    'Không rõ trạng thái';
const emptyRow = () => ({
    providerPostId: '',
    periodStart: '',
    periodEnd: '',
    timezone: '',
    measurementType: 'period',
    reach: '',
    impressions: '',
    interactions: '',
    linkClicks: '',
    text: ''
});
const today = () => {
    const now = new Date();
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now);
};

async function request(path, options = {}) {
    const response = await apiFetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body.error || 'Không thể hoàn tất yêu cầu.');
        error.analysis = body.analysis;
        throw error;
    }
    return body;
}

// Small RFC 4180 parser: quotes, escaped quotes, CRLF and embedded newlines.
function parseCsv(text) {
    const records = [];
    let row = [];
    let field = '';
    let quoted = false;
    const input = text.replace(/^\uFEFF/, '');
    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (quoted) {
            if (char === '"' && input[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            if (field) throw new Error(`Dấu nháy CSV không hợp lệ ở dòng ${records.length + 1}.`);
            quoted = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && input[index + 1] === '\n') index += 1;
            row.push(field);
            if (row.some((value) => value.trim())) records.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }
    if (quoted) throw new Error('CSV có ô chưa đóng dấu nháy.');
    row.push(field);
    if (row.some((value) => value.trim())) records.push(row);
    if (records.length < 2) throw new Error('CSV cần hàng tiêu đề và ít nhất một bài.');
    const headers = records.shift().map((value) => value.trim());
    if (new Set(headers).size !== headers.length || !headers.includes('providerPostId')) {
        throw new Error('CSV cần cột providerPostId và không được trùng tên cột.');
    }
    const unknown = headers.filter((name) => !CSV_COLUMNS.includes(name));
    if (unknown.length) throw new Error(`Cột CSV không hỗ trợ: ${unknown.join(', ')}.`);
    if (records.length > 30) throw new Error('Mỗi lần nhập tối đa 30 bài.');
    return records.map((values, index) => {
        if (values.length !== headers.length) {
            throw new Error(`Dòng ${index + 2} có số cột khác hàng tiêu đề.`);
        }
        const parsed = Object.fromEntries(headers.map((key, i) => [key, values[i]]));
        return { ...emptyRow(), ...parsed, measurementType: parsed.measurementType || 'period' };
    });
}

function validateRows(rows, periodStart, periodEnd, timezone) {
    const errors = [];
    const validDate = (value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(periodStart) || !validDate(periodEnd) || periodStart > periodEnd) {
        errors.push('Chọn kỳ đo hợp lệ, ngày bắt đầu không sau ngày kết thúc.');
    }
    if (!rows.length || rows.length > 30) errors.push('Chọn từ 1 đến 30 bài.');
    const seen = new Map();
    rows.forEach((row, index) => {
        const line = `Bài ${index + 1}`;
        const id = row.providerPostId.trim();
        const start = row.periodStart || periodStart;
        const end = row.periodEnd || periodEnd;
        if (!id) errors.push(`${line}: thiếu provider post ID.`);
        else if (id.length > 160 || !/^[A-Za-z0-9_.:-]+$/.test(id)) {
            errors.push(`${line}: provider post ID không hợp lệ.`);
        }
        if (
            !validDate(start) ||
            !validDate(end) ||
            start > end ||
            start < periodStart ||
            end > periodEnd
        ) {
            errors.push(`${line}: kỳ đo không nằm trong kỳ báo cáo.`);
        }
        if (row.timezone && row.timezone !== timezone) {
            errors.push(`${line}: múi giờ phải trùng kỳ báo cáo.`);
        }
        if (row.measurementType !== 'period') {
            errors.push(`${line}: snapshot lifetime không dùng được; cần số đo theo kỳ.`);
        }
        for (const key of NUMBERS) {
            const value = String(row[key] ?? '').trim();
            if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
                errors.push(`${line}: ${key} phải là số nguyên không âm hoặc để trống.`);
            }
        }
        if (row.text.length > 1000) errors.push(`${line}: nội dung vượt 1.000 ký tự.`);
        if (id && start && end) {
            const earlier = seen.get(id) || [];
            if (earlier.some(([oldStart, oldEnd]) => start <= oldEnd && end >= oldStart)) {
                errors.push(`${line}: trùng hoặc chồng kỳ với cùng post ID ${id}.`);
            }
            seen.set(id, [...earlier, [start, end]]);
        }
    });
    return errors;
}

function valueLabel(metric) {
    if (!metric || metric.value === null || metric.value === undefined) return 'Chưa tính được';
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(metric.value)}${metric.unit === '%' ? '%' : metric.unit ? ` ${metric.unit}` : ''}`;
}

function Report({ analysis, onExport }) {
    const report = analysis.report;
    const facts = analysis.facts || [];
    const byId = new Map(facts.map((fact) => [fact.id, fact]));
    return (
        <section className="ai-panel ai-report" aria-labelledby="ai-report-title">
            <div className="ai-section-heading">
                <div>
                    <p className="ai-eyebrow">BÁO CÁO ĐÃ LƯU</p>
                    <h2 id="ai-report-title">Phân tích #{analysis.id}</h2>
                    <small>
                        {new Date(analysis.createdAt).toLocaleString('vi-VN')} ·{' '}
                        {analysisStatus(analysis.status)}
                    </small>
                </div>
                <div className="ai-actions ai-print-actions">
                    <Button icon={Download} onClick={onExport}>
                        Xuất CSV
                    </Button>
                    <Button icon={Printer} onClick={() => window.print()}>
                        In báo cáo
                    </Button>
                </div>
            </div>
            {analysis.error && (
                <p className="ai-alert" role="alert">
                    {analysis.error}
                </p>
            )}
            {report ? (
                <>
                    <p className="ai-summary">{report.summary}</p>
                    <div className="ai-report-columns">
                        <div>
                            <h3>Nhận xét có căn cứ</h3>
                            {report.findings?.length ? (
                                report.findings.map((finding, index) => (
                                    <article className="ai-finding" key={index}>
                                        <p>{finding.explanation}</p>
                                        <Evidence ids={finding.factIds} byId={byId} />
                                    </article>
                                ))
                            ) : (
                                <p className="ai-muted">Không có nhận xét.</p>
                            )}
                        </div>
                        <div>
                            <h3>Đề xuất thử nghiệm</h3>
                            {report.recommendations?.length ? (
                                report.recommendations.slice(0, 3).map((item, index) => (
                                    <article className="ai-finding" key={index}>
                                        <strong>
                                            {index + 1}. {item.action}
                                        </strong>
                                        <p>{item.rationale}</p>
                                        <small>Quan sát kỳ sau: {item.expectedObservation}</small>
                                        <Evidence ids={item.factIds} byId={byId} />
                                    </article>
                                ))
                            ) : (
                                <p className="ai-muted">Không có đề xuất đủ căn cứ.</p>
                            )}
                        </div>
                    </div>
                    <h3>Giới hạn phân tích</h3>
                    <ul className="ai-limitations">
                        {(report.limitations || []).map((item, index) => (
                            <li key={index}>{item}</li>
                        ))}
                    </ul>
                </>
            ) : (
                <p className="ai-muted">
                    {analysis.status === 'reserved'
                        ? 'Yêu cầu AI đang xử lý. Tải lại lịch sử sau ít phút để xem kết quả.'
                        : 'Nhà cung cấp AI chưa trả báo cáo hợp lệ. KPI và facts bên dưới vẫn được lưu.'}
                </p>
            )}
            <p className="ai-footnote">
                Phạm vi: {analysis.kpis?.postCount?.value ?? '—'} bài được chọn; kết quả không đại
                diện toàn Page khi còn bài ngoài tập này. Đề xuất cần người dùng tự xem xét và thực
                hiện.
            </p>
        </section>
    );
}

function Evidence({ ids = [], byId }) {
    return (
        <div className="ai-evidence">
            {ids.map((id) => {
                const fact = byId.get(id);
                if (!fact) return null;
                return (
                    <details key={id}>
                        <summary>
                            {fact.label}: {valueLabel(fact)} <span>· xem căn cứ</span>
                        </summary>
                        <div className="ai-evidence-detail">
                            <p>Mã fact: {fact.id}</p>
                            <p>Bài: {fact.providerPostId || 'Tổng hợp bài đã chọn'}</p>
                            <p>
                                Kỳ: {fact.periodStart} – {fact.periodEnd}
                            </p>
                            <p>Định nghĩa: {fact.definition}</p>
                            {fact.reason && <p>Chưa tính được: {fact.reason}</p>}
                        </div>
                    </details>
                );
            })}
        </div>
    );
}

export default function AiAnalysis() {
    const { user, social, socialLoading, socialError, refreshSocial } = useWorkspace();
    const canWrite = ['admin', 'manager'].includes(user.role);
    const pages = (social.accounts || []).filter((account) => account.platform === 'Facebook');
    const [pageId, setPageId] = useState('');
    const [periodStart, setPeriodStart] = useState(() => {
        const day = new Date(`${today()}T00:00:00+07:00`);
        day.setUTCDate(day.getUTCDate() - 7);
        return day.toISOString().slice(0, 10);
    });
    const [periodEnd, setPeriodEnd] = useState(today);
    const [timezone, setTimezone] = useState(TIMEZONE);
    const [source, setSource] = useState('manual');
    const [sourceLabel, setSourceLabel] = useState('');
    const [rows, setRows] = useState([emptyRow()]);
    const [imported, setImported] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [includeText, setIncludeText] = useState(false);
    const [status, setStatus] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [historyError, setHistoryError] = useState('');
    const [historyLoading, setHistoryLoading] = useState(true);
    const validation = useMemo(
        () => validateRows(rows, periodStart, periodEnd, timezone),
        [rows, periodStart, periodEnd, timezone]
    );
    const selectedPage = pages.find((account) => account.pageId === pageId);
    const disclosure = includeText ? imported?.aiPayloadWithText : imported?.aiPayload;
    const aiAvailable = Boolean(
        status?.ready &&
        status?.providerConfigured &&
        status?.remainingToday > 0 &&
        (status?.freeTierOnly || (status?.budgetConfigured && status?.remainingBudgetVnd > 0))
    );
    const aiStatusLabel = !status
        ? 'Đang kiểm tra AI…'
        : !status.ready
          ? status.error || 'Cần PostgreSQL để dùng AI'
          : !status.providerConfigured
            ? 'AI chưa cấu hình'
            : !status.freeTierOnly && !status.budgetConfigured
              ? 'Chưa cấu hình hạn mức AI'
              : status.remainingToday <= 0 ||
                  (!status.freeTierOnly && status.remainingBudgetVnd <= 0)
                ? 'Đã hết hạn mức AI hôm nay'
                : `${status.freeTierOnly ? 'Model có Free Tier' : 'AI sẵn sàng'} · còn ${status.remainingToday} lượt hôm nay`;

    async function loadHistory(offset = 0) {
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const result = await request(`/api/ai/analyses?limit=20&offset=${offset}`);
            setHistory(offset ? (current) => [...current, ...result.items] : result.items);
            setHistoryTotal(result.total);
        } catch (cause) {
            setHistoryError(cause.message);
        } finally {
            setHistoryLoading(false);
        }
    }
    useEffect(() => {
        let active = true;
        request('/api/ai/status')
            .then((result) => {
                if (active) setStatus(result);
            })
            .catch((cause) => {
                if (active) setStatus({ ready: false, error: cause.message });
            });
        loadHistory();
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        if (!pageId && pages.length) setPageId(pages[0].pageId);
    }, [pageId, pages]);
    function invalidate() {
        setImported(null);
        setAnalysis(null);
        setNotice('');
    }
    function editRow(index, field, value) {
        setRows((current) =>
            current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
        );
        invalidate();
    }
    async function upload(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setError('');
        if (file.size > 256 * 1024) {
            setError('CSV tối đa 256 KB.');
            return;
        }
        try {
            const next = parseCsv(await file.text());
            setRows(next);
            setSource((current) => (current === 'demo' ? 'demo' : 'csv'));
            setSourceLabel(file.name);
            invalidate();
        } catch (cause) {
            setError(cause.message);
        }
    }
    function template() {
        exportRows(
            [
                {
                    providerPostId: 'PAGEID_POSTID',
                    periodStart,
                    periodEnd,
                    timezone,
                    measurementType: 'period',
                    reach: 100,
                    impressions: 150,
                    interactions: 8,
                    linkClicks: 2,
                    text: ''
                }
            ],
            CSV_COLUMNS.map((key) => ({ key, label: key })),
            'omni-ai-analysis-template'
        );
    }
    async function saveImport() {
        setError('');
        setNotice('');
        if (!pageId) return setError('Chọn một Facebook Page đã liên kết.');
        if (validation.length) return setError(validation.join(' '));
        setBusy('import');
        try {
            const body = await request('/api/ai/imports', {
                method: 'POST',
                body: JSON.stringify({
                    pageId,
                    periodStart,
                    periodEnd,
                    timezone,
                    source,
                    sourceLabel: sourceLabel.trim() || undefined,
                    rows: rows.map((row) => ({
                        providerPostId: row.providerPostId.trim(),
                        ...(row.periodStart ? { periodStart: row.periodStart } : {}),
                        ...(row.periodEnd ? { periodEnd: row.periodEnd } : {}),
                        ...(row.timezone ? { timezone: row.timezone } : {}),
                        measurementType: row.measurementType,
                        ...Object.fromEntries(
                            NUMBERS.map((key) => [key, row[key] === '' ? null : Number(row[key])])
                        ),
                        ...(row.text.trim() ? { text: row.text.trim() } : {})
                    }))
                })
            });
            setImported(body);
            setAnalysis(null);
            setIncludeText(false);
            setNotice('Đã lưu số liệu và tính KPI. Kiểm tra dữ liệu gửi AI trước khi tiếp tục.');
        } catch (cause) {
            setError(cause.message);
        } finally {
            setBusy('');
        }
    }
    async function runAnalysis() {
        if (!imported) return;
        setBusy('analysis');
        setError('');
        setNotice('');
        try {
            const body = await request('/api/ai/analyses', {
                method: 'POST',
                body: JSON.stringify({ importId: imported.import.id, includeText })
            });
            setAnalysis(body.analysis);
            setNotice(
                body.cached ? 'Đã mở báo cáo có sẵn cho cùng dữ liệu.' : 'Đã lưu báo cáo phân tích.'
            );
        } catch (cause) {
            if (cause.analysis) setAnalysis(cause.analysis);
            setError(cause.message);
        } finally {
            setBusy('');
            loadHistory();
            request('/api/ai/status')
                .then(setStatus)
                .catch(() => {});
        }
    }
    async function openHistory(id) {
        setBusy('history');
        setError('');
        try {
            const body = await request(`/api/ai/analyses/${encodeURIComponent(id)}`);
            setAnalysis(body.analysis);
            const importId = body.analysis.importId;
            if (importId) {
                const importedBody = await request(
                    `/api/ai/imports/${encodeURIComponent(importId)}`
                );
                setImported(importedBody);
                setIncludeText(false);
            }
            document.getElementById('ai-results')?.scrollIntoView({ behavior: 'smooth' });
        } catch (cause) {
            setError(cause.message);
        } finally {
            setBusy('');
        }
    }
    function exportReport() {
        if (!analysis) return;
        const lines = [
            {
                section: 'Tóm tắt',
                text: analysis.report?.summary || analysis.error || '',
                factIds: ''
            },
            ...(analysis.report?.findings || []).map((item) => ({
                section: 'Nhận xét',
                text: item.explanation,
                factIds: item.factIds.join(' | ')
            })),
            ...(analysis.report?.recommendations || []).map((item) => ({
                section: 'Đề xuất',
                text: `${item.action} — ${item.rationale} — Quan sát: ${item.expectedObservation}`,
                factIds: item.factIds.join(' | ')
            })),
            ...(analysis.facts || []).map((fact) => ({
                section: 'Fact',
                text: `${fact.label}: ${valueLabel(fact)}; ${fact.definition}; ${fact.reason || ''}`,
                factIds: fact.id
            }))
        ];
        exportRows(
            lines,
            [
                { key: 'section', label: 'Loại' },
                { key: 'text', label: 'Nội dung' },
                { key: 'factIds', label: 'Mã căn cứ' }
            ],
            `ai-analysis-${analysis.id}`
        );
    }

    const currentKpis = analysis?.kpis || imported?.kpis;
    const currentFacts = analysis?.facts || imported?.facts;
    const currentLimitations = analysis?.limitations || imported?.limitations;
    return (
        <div className="ai-analysis">
            <div className="ai-toolbar">
                <div>
                    <p className="ai-eyebrow">FACEBOOK PAGE · THEO KỲ ĐO</p>
                    <h2>Dữ liệu → căn cứ → đề xuất</h2>
                    <p>
                        Chọn tối đa 30 bài. KPI do máy chủ tính; AI chỉ diễn giải dữ liệu được hiển
                        thị trước.
                    </p>
                </div>
                <span className={`ai-provider-state ${aiAvailable ? 'ready' : ''}`}>
                    {aiStatusLabel}
                </span>
            </div>
            {status?.freeTierOnly && (
                <p className="ai-helper">
                    Để tránh phát sinh phí, dùng API key của project đang ở Free Tier trong Google
                    AI Studio. Ứng dụng không thể tự kiểm tra tier từ key.
                </p>
            )}
            {error && (
                <div className="ai-alert" role="alert">
                    {error}
                </div>
            )}
            {notice && (
                <div className="ai-notice" role="status">
                    {notice}
                </div>
            )}
            <div className="ai-layout">
                <div className="ai-primary">
                    <section className="ai-panel" aria-labelledby="ai-input-title">
                        <div className="ai-section-heading">
                            <div>
                                <p className="ai-eyebrow">01 · SỐ LIỆU NGUỒN</p>
                                <h2 id="ai-input-title">Chọn Page và kỳ đo</h2>
                            </div>
                        </div>
                        <div className="ai-fields">
                            <label>
                                Facebook Page
                                <select
                                    value={pageId}
                                    onChange={(event) => {
                                        setPageId(event.target.value);
                                        invalidate();
                                    }}
                                    disabled={!canWrite}
                                >
                                    <option value="">Chọn Page đã liên kết</option>
                                    {pages.map((page) => (
                                        <option key={page.pageId} value={page.pageId}>
                                            {page.name} · {page.pageId}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Từ ngày
                                <input
                                    type="date"
                                    value={periodStart}
                                    onChange={(event) => {
                                        setPeriodStart(event.target.value);
                                        invalidate();
                                    }}
                                    disabled={!canWrite}
                                />
                            </label>
                            <label>
                                Đến ngày
                                <input
                                    type="date"
                                    value={periodEnd}
                                    onChange={(event) => {
                                        setPeriodEnd(event.target.value);
                                        invalidate();
                                    }}
                                    disabled={!canWrite}
                                />
                            </label>
                            <label>
                                Múi giờ
                                <select
                                    value={timezone}
                                    onChange={(event) => {
                                        setTimezone(event.target.value);
                                        invalidate();
                                    }}
                                    disabled={!canWrite}
                                >
                                    {TIMEZONES.map((zone) => (
                                        <option key={zone} value={zone}>
                                            {zone}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <p className="ai-helper">
                            Số liệu phải được đo trong đúng kỳ và múi giờ đã chọn; không dùng
                            snapshot lifetime. Reach cộng theo bài không phải unique reach của Page.
                        </p>
                        {socialLoading && <p role="status">Đang tải Facebook Page…</p>}
                        {socialError && (
                            <p className="ai-alert" role="alert">
                                {socialError}{' '}
                                <button type="button" onClick={refreshSocial}>
                                    Thử lại
                                </button>
                            </p>
                        )}
                        {!socialLoading && !pages.length && (
                            <p className="ai-empty">
                                Chưa có Facebook Page đã liên kết. Liên kết Page trong mục Liên kết
                                tài khoản để nhập dữ liệu.
                            </p>
                        )}
                        {canWrite && (
                            <>
                                <div className="ai-source-line">
                                    <label>
                                        Nguồn dữ liệu
                                        <select
                                            value={source}
                                            onChange={(event) => {
                                                setSource(event.target.value);
                                                invalidate();
                                            }}
                                        >
                                            <option value="manual">Nhập tay</option>
                                            <option value="csv">CSV được phép sử dụng</option>
                                            <option value="demo">
                                                Dữ liệu tổng hợp chỉ để demo
                                            </option>
                                        </select>
                                    </label>
                                    <label>
                                        Mô tả nguồn
                                        <input
                                            value={sourceLabel}
                                            maxLength={120}
                                            onChange={(event) => {
                                                setSourceLabel(event.target.value);
                                                invalidate();
                                            }}
                                            placeholder="Ví dụ: Meta Insights, ghi nhận ngày…"
                                        />
                                    </label>
                                </div>
                                {source === 'demo' && (
                                    <p className="ai-demo-label">
                                        Dữ liệu tổng hợp demo; không dùng để kết luận hiệu quả thật.
                                    </p>
                                )}
                                <div className="ai-actions">
                                    <label className="ai-file-button">
                                        <FileUp size={16} /> Chọn CSV
                                        <input
                                            type="file"
                                            accept=".csv,text/csv"
                                            onChange={upload}
                                            className="sr-only"
                                        />
                                    </label>
                                    <Button icon={Download} onClick={template}>
                                        Tải CSV mẫu
                                    </Button>
                                </div>
                            </>
                        )}
                        <p className="ai-helper">
                            interactions = tổng hành động tương tác của bài trong kỳ; linkClicks =
                            lượt nhấp liên kết cùng kỳ. Để trống nếu không có số liệu, nhập 0 chỉ
                            khi số đo thực là 0.
                        </p>
                        <p className="ai-helper">
                            Kỳ và múi giờ của từng bài để trống sẽ dùng kỳ báo cáo. Sau khi chọn
                            CSV, hãy kiểm tra lại các giá trị bên dưới trước khi lưu.
                        </p>
                        {canWrite && (
                            <div className="ai-table-wrap">
                                <table className="ai-input-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Bài / Post ID</th>
                                            <th scope="col">Từ ngày</th>
                                            <th scope="col">Đến ngày</th>
                                            <th scope="col">Múi giờ</th>
                                            <th scope="col">Kiểu đo</th>
                                            <th scope="col">Reach</th>
                                            <th scope="col">Hiển thị</th>
                                            <th scope="col">Tương tác</th>
                                            <th scope="col">Nhấp link</th>
                                            <th scope="col">Nội dung tùy chọn</th>
                                            <th scope="col" aria-label="Xóa bài" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, index) => (
                                            <tr key={index}>
                                                <td>
                                                    <input
                                                        aria-label={`Post ID bài ${index + 1}`}
                                                        value={row.providerPostId}
                                                        onChange={(event) =>
                                                            editRow(
                                                                index,
                                                                'providerPostId',
                                                                event.target.value
                                                            )
                                                        }
                                                        placeholder="PAGEID_POSTID"
                                                    />
                                                </td>
                                                {['periodStart', 'periodEnd'].map((key) => (
                                                    <td key={key}>
                                                        <input
                                                            type="date"
                                                            aria-label={`${key === 'periodStart' ? 'Từ ngày' : 'Đến ngày'} bài ${index + 1}`}
                                                            value={row[key]}
                                                            onChange={(event) =>
                                                                editRow(
                                                                    index,
                                                                    key,
                                                                    event.target.value
                                                                )
                                                            }
                                                        />
                                                    </td>
                                                ))}
                                                <td>
                                                    <select
                                                        aria-label={`Múi giờ bài ${index + 1}`}
                                                        value={row.timezone}
                                                        onChange={(event) =>
                                                            editRow(
                                                                index,
                                                                'timezone',
                                                                event.target.value
                                                            )
                                                        }
                                                    >
                                                        <option value="">Theo kỳ báo cáo</option>
                                                        {TIMEZONES.map((zone) => (
                                                            <option key={zone} value={zone}>
                                                                {zone}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select
                                                        aria-label={`Kiểu đo bài ${index + 1}`}
                                                        value={row.measurementType}
                                                        onChange={(event) =>
                                                            editRow(
                                                                index,
                                                                'measurementType',
                                                                event.target.value
                                                            )
                                                        }
                                                    >
                                                        <option value="period">Theo kỳ</option>
                                                        <option value="lifetime">
                                                            Snapshot lifetime
                                                        </option>
                                                    </select>
                                                </td>
                                                {NUMBERS.map((key) => (
                                                    <td key={key}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            aria-label={`${key} bài ${index + 1}`}
                                                            value={row[key]}
                                                            onChange={(event) =>
                                                                editRow(
                                                                    index,
                                                                    key,
                                                                    event.target.value
                                                                )
                                                            }
                                                        />
                                                    </td>
                                                ))}
                                                <td>
                                                    <input
                                                        aria-label={`Nội dung bài ${index + 1}`}
                                                        value={row.text}
                                                        onChange={(event) =>
                                                            editRow(
                                                                index,
                                                                'text',
                                                                event.target.value
                                                            )
                                                        }
                                                        maxLength={1000}
                                                        placeholder="Có thể bỏ trống"
                                                    />
                                                </td>
                                                <td>
                                                    <button
                                                        className="ai-icon-button"
                                                        type="button"
                                                        aria-label={`Xóa bài ${index + 1}`}
                                                        disabled={rows.length === 1}
                                                        onClick={() => {
                                                            setRows((current) =>
                                                                current.filter(
                                                                    (_, i) => i !== index
                                                                )
                                                            );
                                                            invalidate();
                                                        }}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {canWrite && (
                            <div className="ai-actions ai-bottom-actions">
                                <Button
                                    icon={Plus}
                                    disabled={rows.length >= 30}
                                    onClick={() => {
                                        setRows((current) => [...current, emptyRow()]);
                                        invalidate();
                                    }}
                                >
                                    Thêm bài
                                </Button>
                                <span>{rows.length}/30 bài</span>
                                <Button
                                    kind="primary"
                                    disabled={!!busy || !pageId || validation.length > 0}
                                    onClick={saveImport}
                                >
                                    {busy === 'import'
                                        ? 'Đang kiểm tra…'
                                        : 'Lưu số liệu & tính KPI'}
                                </Button>
                            </div>
                        )}
                        {canWrite && validation.length > 0 && (
                            <ul className="ai-validation" aria-live="polite">
                                {validation.slice(0, 5).map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ul>
                        )}
                        {!canWrite && (
                            <p className="ai-muted">
                                Vai trò hiện tại chỉ xem báo cáo đã lưu. Admin hoặc Manager có thể
                                nhập và yêu cầu phân tích.
                            </p>
                        )}
                    </section>
                    <div id="ai-results">
                        {currentKpis && (
                            <section className="ai-panel" aria-labelledby="ai-kpi-title">
                                <div className="ai-section-heading">
                                    <div>
                                        <p className="ai-eyebrow">02 · CODE TÍNH TOÁN</p>
                                        <h2 id="ai-kpi-title">KPI của tập bài đã chọn</h2>
                                    </div>
                                </div>
                                <div className="ai-kpi-grid">
                                    {Object.entries(KPI_LABELS).map(([key, label]) => (
                                        <div className="ai-kpi" key={key}>
                                            <span>{label}</span>
                                            <strong>{valueLabel(currentKpis[key])}</strong>
                                            {currentKpis[key]?.reason && (
                                                <small>{currentKpis[key].reason}</small>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <p className="ai-helper">
                                    Tổng reach theo bài có thể trùng người giữa các bài. Tỷ lệ thiếu
                                    tử số/mẫu số hoặc mẫu số bằng 0 được để trống cùng lý do.
                                </p>
                                {currentLimitations?.length > 0 && (
                                    <ul className="ai-limitations">
                                        {currentLimitations.map((item, index) => (
                                            <li key={index}>{item}</li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        )}
                        {currentFacts?.length > 0 && (
                            <section className="ai-panel" aria-labelledby="ai-facts-title">
                                <div className="ai-section-heading">
                                    <div>
                                        <p className="ai-eyebrow">CĂN CỨ CÓ MÃ</p>
                                        <h2 id="ai-facts-title">Facts đã tính</h2>
                                    </div>
                                    <span>{currentFacts.length} facts</span>
                                </div>
                                <div className="ai-fact-list">
                                    {currentFacts.map((fact) => (
                                        <details key={fact.id}>
                                            <summary>
                                                <span>
                                                    {fact.label}
                                                    <small>
                                                        {fact.providerPostId || 'Tập bài đã chọn'} ·{' '}
                                                        {fact.id}
                                                    </small>
                                                </span>
                                                <strong>{valueLabel(fact)}</strong>
                                            </summary>
                                            <div className="ai-evidence-detail">
                                                <p>
                                                    Kỳ: {fact.periodStart} – {fact.periodEnd}
                                                </p>
                                                <p>Định nghĩa: {fact.definition}</p>
                                                {fact.reason && <p>Lý do: {fact.reason}</p>}
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            </section>
                        )}
                        {imported && canWrite && (
                            <section className="ai-panel" aria-labelledby="ai-disclosure-title">
                                <div className="ai-section-heading">
                                    <div>
                                        <p className="ai-eyebrow">03 · XÁC NHẬN GỬI AI</p>
                                        <h2 id="ai-disclosure-title">
                                            Dữ liệu sẽ gửi ra dịch vụ AI
                                        </h2>
                                    </div>
                                </div>
                                <p className="ai-helper">
                                    Mã Page và bài được thay bằng mã ẩn danh. Dịch vụ AI nhận kỳ,
                                    nguồn, facts và nội dung bài chỉ khi chọn bên dưới. Token,
                                    cookie, email và dữ liệu khách hàng không được gửi.
                                </p>
                                <label className="ai-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={includeText}
                                        disabled={!imported.aiPayloadWithText}
                                        onChange={(event) => setIncludeText(event.target.checked)}
                                    />{' '}
                                    Gửi nội dung của các bài đã nhập (
                                    {imported.import.rows.filter((row) => row.text).length} bài có
                                    nội dung)
                                </label>
                                <details className="ai-payload" open>
                                    <summary>Xem toàn bộ dữ liệu gửi AI</summary>
                                    <pre>{JSON.stringify(disclosure, null, 2)}</pre>
                                </details>
                                <div className="ai-actions ai-bottom-actions">
                                    <span>
                                        {selectedPage?.name || imported.import.pageId} ·{' '}
                                        {imported.import.periodStart} – {imported.import.periodEnd}
                                    </span>
                                    <Button
                                        kind="primary"
                                        disabled={!!busy || !aiAvailable || !disclosure}
                                        onClick={runAnalysis}
                                    >
                                        {busy === 'analysis'
                                            ? 'Đang phân tích…'
                                            : 'Yêu cầu AI phân tích'}
                                    </Button>
                                </div>
                                {!aiAvailable && (
                                    <p className="ai-helper">{aiStatusLabel}. KPI vẫn dùng được.</p>
                                )}
                                {!disclosure && (
                                    <p className="ai-alert" role="alert">
                                        Chưa thể xem dữ liệu gửi AI. Tải lại số liệu trước khi phân
                                        tích.
                                    </p>
                                )}
                            </section>
                        )}
                        {analysis && <Report analysis={analysis} onExport={exportReport} />}
                        {!currentKpis && !analysis && (
                            <div className="ai-empty">
                                Nhập số liệu theo kỳ để xem KPI và căn cứ trước khi yêu cầu AI.
                            </div>
                        )}
                    </div>
                </div>
                <aside className="ai-history ai-panel" aria-labelledby="ai-history-title">
                    <div className="ai-section-heading">
                        <div>
                            <p className="ai-eyebrow">LỊCH SỬ</p>
                            <h2 id="ai-history-title">Báo cáo đã lưu</h2>
                        </div>
                        <button
                            type="button"
                            className="ai-icon-button"
                            aria-label="Tải lại lịch sử"
                            onClick={() => loadHistory()}
                            disabled={historyLoading}
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                    {historyError && (
                        <p className="ai-alert" role="alert">
                            {historyError}
                        </p>
                    )}
                    {historyLoading && !history.length ? (
                        <p className="ai-muted" role="status">
                            Đang tải lịch sử…
                        </p>
                    ) : !history.length ? (
                        <p className="ai-muted">
                            Chưa có báo cáo. Dữ liệu nhập và báo cáo chỉ xuất hiện sau khi được lưu
                            trên PostgreSQL.
                        </p>
                    ) : (
                        <>
                            <ul className="ai-history-list">
                                {history.map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            disabled={!!busy}
                                            onClick={() => openHistory(item.id)}
                                        >
                                            <strong>
                                                {item.pageId} · {item.periodStart} –{' '}
                                                {item.periodEnd}
                                            </strong>
                                            <span>
                                                {analysisStatus(item.status)} ·{' '}
                                                {new Date(item.createdAt).toLocaleString('vi-VN')}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {history.length < historyTotal && (
                                <Button
                                    onClick={() => loadHistory(history.length)}
                                    disabled={historyLoading}
                                >
                                    Tải thêm
                                </Button>
                            )}
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
}

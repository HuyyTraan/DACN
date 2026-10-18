import React, { useEffect, useRef, useState } from 'react';
import {
    ArrowDown,
    ArrowUpRight,
    ArrowUpDown,
    Check,
    ChevronLeft,
    ChevronRight,
    Download,
    Filter,
    Inbox,
    Search,
    X
} from 'lucide-react';

export const number = (value) => new Intl.NumberFormat('vi-VN').format(value || 0);
export const money = (value) => number(value) + ' ₫';
export const compact = (value) =>
    new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(
        value || 0
    );
export const dateLabel = (value) =>
    value ? new Date(value + 'T12:00:00').toLocaleDateString('vi-VN') : '—';
const colors = {
    Facebook: '#1877f2',
    Instagram: '#d95a8c',
    Threads: '#101010',
    Google: '#4285f4',
    TikTok: '#242834',
    YouTube: '#ed5757',
    Zalo: '#008fe5'
};
export function Platform({ name, small = false }) {
    return (
        <span
            className={`platform ${small ? 'small' : ''}`}
            style={{ '--platform': colors[name] || '#777' }}
        >
            <span className="platform-mark">
                {{
                    Facebook: 'f',
                    Threads: '@',
                    Instagram: '◎',
                    Google: 'G',
                    TikTok: '♪',
                    YouTube: '▶',
                    Zalo: 'Z',
                    LinkedIn: 'in',
                    X: '𝕏'
                }[name] || '•'}
            </span>
            {!small && name}
        </span>
    );
}
export function Avatar({ name, src, size = '', tone = 0 }) {
    return (
        <span className={`avatar ${size} tone-${tone % 4}`} aria-hidden="true">
            {src && /^https:\/\//.test(src) && (
                <img
                    src={src}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                />
            )}
            {name
                .split(' ')
                .slice(-2)
                .map((n) => n[0])
                .join('')}
        </span>
    );
}
export function Badge({ value }) {
    const type = /Hoạt động|kết nối$|Đang chạy|Đã đăng|Đã chuyển đổi|Top 10|Đã xử lý/.test(value)
        ? 'green'
        : /nháp|Tạm dừng/.test(value)
          ? 'gray'
          : /lại|Lỗi|Đã hủy/.test(value)
            ? 'red'
            : /duyệt|Tiềm năng|Chưa/.test(value)
              ? 'amber'
              : 'purple';
    return (
        <span className={`badge ${type}`}>
            <i />
            {value}
        </span>
    );
}
export function Button({ children, icon: Icon, kind = '', ...props }) {
    return (
        <button className={`button ${kind}`} {...props}>
            {Icon && <Icon size={16} />}
            {children}
        </button>
    );
}
export function Empty({
    title = 'Chưa có dữ liệu',
    description = 'Dữ liệu sẽ xuất hiện tại đây khi bạn thêm mục đầu tiên.',
    action
}) {
    return (
        <div className="empty">
            <div className="empty-icon">
                <Inbox size={28} />
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
            {action}
        </div>
    );
}
export function Metric({
    label,
    value,
    delta,
    icon: Icon,
    note = 'so với kỳ trước',
    tone = 'purple'
}) {
    return (
        <article className="metric">
            <div className="metric-label">
                {label}
                <span className={`metric-icon ${tone}`}>
                    <Icon size={17} />
                </span>
            </div>
            <strong>{value}</strong>
            <div className="metric-bottom">
                <span className={delta?.startsWith('-') ? 'negative' : 'positive'}>
                    {delta?.startsWith('-') ? <ArrowDown size={13} /> : <ArrowUpRight size={13} />}
                    {delta}
                </span>
                <span>{note}</span>
            </div>
        </article>
    );
}
export function Panel({ title, subtitle, action, children, className = '' }) {
    return (
        <section className={`panel ${className}`}>
            <div className="panel-head">
                <div>
                    <h2>{title}</h2>
                    {subtitle && <p>{subtitle}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}
export function LineChart({ period = 'month', platform = '', compare = false }) {
    const [point, setPoint] = useState(null);
    const values =
        period === 'week'
            ? [18, 26, 22, 40, 35, 51, 46]
            : [16, 24, 20, 39, 31, 47, 35, 48, 41, 58, 50, 67, 63, 79];
    const scale = platform ? 0.67 : 1;
    const path = values
        .map(
            (v, i) =>
                `${i ? 'L' : 'M'}${50 + i * (630 / (values.length - 1))},${230 - v * 2.35 * scale}`
        )
        .join(' ');
    const secondary = values
        .map(
            (v, i) =>
                `${i ? 'L' : 'M'}${50 + i * (630 / (values.length - 1))},${230 - (v * 0.62 + (i % 3) * 7) * 2.35 * scale}`
        )
        .join(' ');
    const labels =
        period === 'week'
            ? ['04 Th10', '05 Th10', '06 Th10', '07 Th10', '08 Th10', '09 Th10', '10 Th10']
            : ['01 Th10', '06 Th10', '11 Th10', '16 Th10', '21 Th10', '26 Th10', '31 Th10'];
    return (
        <div className="chart-wrap">
            <svg
                className="line-chart"
                viewBox="0 0 720 280"
                role="img"
                aria-label={`Biểu đồ tiếp cận ${period === 'week' ? '7 ngày' : 'tháng 10'}; dữ liệu minh họa`}
            >
                <defs>
                    <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8874e6" stopOpacity=".18" />
                        <stop offset="100%" stopColor="#8874e6" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {[0, 1, 2, 3, 4].map((i) => (
                    <g key={i}>
                        <line
                            x1="50"
                            x2="690"
                            y1={230 - i * 50}
                            y2={230 - i * 50}
                            stroke="#eceef2"
                            strokeDasharray="4 5"
                        />
                        <text x="38" y={234 - i * 50} textAnchor="end">
                            {i * 20}k
                        </text>
                    </g>
                ))}
                <path d={`${path} L680,230 L50,230 Z`} fill="url(#chart-fill)" />
                <path
                    d={secondary}
                    fill="none"
                    stroke={compare ? '#f3b268' : '#70bcaf'}
                    strokeWidth="2.5"
                    strokeDasharray={compare ? '0' : '5 5'}
                />
                <path
                    d={path}
                    fill="none"
                    stroke="#8b75e7"
                    strokeWidth="3"
                    strokeLinejoin="round"
                />
                {values.map((v, i) => (
                    <circle
                        key={i}
                        cx={50 + (i * 630) / (values.length - 1)}
                        cy={230 - v * 2.35 * scale}
                        r="7"
                        fill={point === i ? '#8b75e7' : 'transparent'}
                        onMouseEnter={() => setPoint(i)}
                        onMouseLeave={() => setPoint(null)}
                    >
                        <title>{number(v * 1000 * scale)} lượt tiếp cận (demo)</title>
                    </circle>
                ))}
                {labels.map((v, i) => (
                    <text key={v} x={50 + (i * 630) / 6} y="264" textAnchor="middle">
                        {v}
                    </text>
                ))}
            </svg>
            {point !== null && (
                <div className="chart-tooltip">
                    {number(values[point] * 1000 * scale)} lượt tiếp cận
                </div>
            )}
        </div>
    );
}
export function Modal({ title, children, onClose, wide = false, className = '' }) {
    const ref = useRef(null);
    useEffect(() => {
        const previous = document.activeElement;
        ref.current.showModal();
        return () => {
            previous?.focus();
        };
    }, []);
    return (
        <dialog
            ref={ref}
            aria-labelledby="dialog-title"
            className={`${wide ? 'wide' : ''} ${className}`.trim()}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(e) => {
                if (e.target === ref.current) onClose();
            }}
        >
            <div className="dialog-head">
                <div>
                    <span className="eyebrow">OMNI STUDIO</span>
                    <h2 id="dialog-title">{title}</h2>
                </div>
                <button className="icon-button" onClick={onClose} aria-label="Đóng">
                    <X size={20} />
                </button>
            </div>
            {children}
        </dialog>
    );
}
export function exportRows(rows, columns, name) {
    const blob = new Blob([window.Omni.csv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DataTable({
    rows,
    columns,
    onEdit,
    onDelete,
    onView,
    title = 'Danh sách',
    name = 'du-lieu',
    tabs,
    activeTab,
    onTab,
    extra
}) {
    const [search, setSearch] = useState('');
    const [platform, setPlatform] = useState('');
    const [sort, setSort] = useState({ key: '', direction: 1 });
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState([]);
    const filtered = window.Omni.filterRows(rows, search, platform);
    const sorted = [...filtered].sort((a, b) =>
        sort.key
            ? (typeof a[sort.key] === 'number'
                  ? a[sort.key] - b[sort.key]
                  : String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'vi')) *
              sort.direction
            : 0
    );
    const pages = Math.max(1, Math.ceil(sorted.length / 7));
    const safePage = Math.min(page, pages);
    const visible = sorted.slice((safePage - 1) * 7, safePage * 7);
    const selectable = Boolean(onDelete);
    useEffect(() => {
        setPage(1);
        setSelected([]);
    }, [search, platform, activeTab]);
    useEffect(() => {
        setSelected((s) => s.filter((id) => rows.some((row) => row.id === id)));
    }, [rows]);
    return (
        <section className="panel table-panel">
            <div className="table-title">
                <h2>
                    {title} <span className="count">{rows.length}</span>
                </h2>
                <Button icon={Download} onClick={() => exportRows(sorted, columns, name)}>
                    Xuất CSV
                </Button>
            </div>
            {tabs && (
                <div className="tabs" role="tablist" aria-label={title}>
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            role="tab"
                            aria-selected={activeTab === tab}
                            className={activeTab === tab ? 'active' : ''}
                            onClick={() => onTab(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            )}
            <div className="table-toolbar">
                <label className="search-field">
                    <Search size={16} />
                    <input
                        aria-label={`Tìm trong ${title}`}
                        placeholder="Tìm kiếm theo tên, mã…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </label>
                <div className="toolbar-right">
                    <label className="select-wrap">
                        <Filter size={15} />
                        <select
                            aria-label="Lọc theo kênh"
                            value={platform}
                            onChange={(e) => setPlatform(e.target.value)}
                        >
                            <option value="">Tất cả kênh</option>
                            {window.Omni.platforms.map((p) => (
                                <option key={p}>{p}</option>
                            ))}
                        </select>
                    </label>
                    {selected.length > 0 && (
                        <Button kind="danger" onClick={() => onDelete(selected)}>
                            Xóa {selected.length} mục
                        </Button>
                    )}
                    {extra}
                </div>
            </div>
            {!visible.length ? (
                <Empty
                    title={rows.length ? 'Không tìm thấy kết quả' : 'Chưa có mục nào'}
                    description={
                        rows.length
                            ? 'Thử từ khóa khác hoặc bỏ bộ lọc kênh.'
                            : 'Thêm mục mới để bắt đầu quản lý tại đây.'
                    }
                    action={
                        rows.length ? (
                            <Button
                                onClick={() => {
                                    setSearch('');
                                    setPlatform('');
                                }}
                            >
                                Xóa bộ lọc
                            </Button>
                        ) : null
                    }
                />
            ) : (
                <div className="table-scroll">
                    <table>
                        <thead>
                            <tr>
                                {selectable && (
                                    <th className="check-cell">
                                        <input
                                            type="checkbox"
                                            aria-label="Chọn tất cả trong trang"
                                            checked={visible.every((r) => selected.includes(r.id))}
                                            onChange={(e) =>
                                                setSelected(
                                                    e.target.checked
                                                        ? [
                                                              ...new Set([
                                                                  ...selected,
                                                                  ...visible.map((r) => r.id)
                                                              ])
                                                          ]
                                                        : selected.filter(
                                                              (id) =>
                                                                  !visible.some((r) => r.id === id)
                                                          )
                                                )
                                            }
                                        />
                                    </th>
                                )}
                                {columns.map((c) => (
                                    <th key={c.key}>
                                        <button
                                            onClick={() =>
                                                setSort({
                                                    key: c.key,
                                                    direction:
                                                        sort.key === c.key ? -sort.direction : 1
                                                })
                                            }
                                        >
                                            {c.label}
                                            <ArrowUpDown size={12} />
                                        </button>
                                    </th>
                                ))}
                                {(onEdit || onView) && <th aria-label="Thao tác" />}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((row, i) => (
                                <tr key={row.id}>
                                    {selectable && (
                                        <td className="check-cell">
                                            <input
                                                type="checkbox"
                                                aria-label={`Chọn ${row.name}`}
                                                checked={selected.includes(row.id)}
                                                onChange={(e) =>
                                                    setSelected(
                                                        e.target.checked
                                                            ? [...selected, row.id]
                                                            : selected.filter((id) => id !== row.id)
                                                    )
                                                }
                                            />
                                        </td>
                                    )}
                                    {columns.map((c) => (
                                        <td key={c.key}>
                                            {c.render ? c.render(row, i) : (row[c.key] ?? '—')}
                                        </td>
                                    ))}
                                    {(onEdit || onView) && (
                                        <td>
                                            <button
                                                className="row-action"
                                                onClick={() => (onEdit || onView)(row)}
                                            >
                                                {onEdit ? 'Chỉnh sửa' : 'Chi tiết'}
                                                <ChevronRight size={14} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="table-footer">
                <span>
                    {filtered.length
                        ? `${(safePage - 1) * 7 + 1}–${Math.min(safePage * 7, filtered.length)}`
                        : '0'}{' '}
                    trong {filtered.length} kết quả
                </span>
                <div>
                    <button
                        className="icon-button"
                        aria-label="Trang trước"
                        disabled={safePage === 1}
                        onClick={() => setPage(safePage - 1)}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="page-number">{safePage}</span>
                    <button
                        className="icon-button"
                        aria-label="Trang sau"
                        disabled={safePage === pages}
                        onClick={() => setPage(safePage + 1)}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </section>
    );
}
export function Progress({ value, color }) {
    return (
        <span className="progress">
            <span style={{ width: `${Math.max(0, Math.min(value, 100))}%`, background: color }} />
        </span>
    );
}

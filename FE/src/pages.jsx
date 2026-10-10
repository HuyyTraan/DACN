import React, { useEffect, useState } from 'react';
import {
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    BarChart3,
    CalendarDays,
    Check,
    CheckCheck,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Download,
    ExternalLink,
    Eye,
    FileText,
    Globe2,
    Heart,
    Link2,
    Megaphone,
    MessageCircle,
    MousePointer2,
    Plus,
    Search,
    Send,
    Settings2,
    Sparkles,
    Target,
    TrendingUp,
    Users,
    Wallet,
    Workflow,
    X
} from 'lucide-react';
import { useWorkspace } from './App.jsx';
import {
    Avatar,
    Badge,
    Button,
    DataTable,
    Empty,
    LineChart,
    Metric,
    Panel,
    Platform,
    Progress,
    compact,
    dateLabel,
    exportRows,
    money,
    number
} from './components.jsx';

const nameColumn = {
    key: 'name',
    label: 'Tên',
    render: (r, i) => (
        <div className="name-cell">
            <Avatar name={r.name} tone={i} />
            <div>
                <strong>{r.name}</strong>
                <small>{r.email || r.id.slice(0, 12)}</small>
            </div>
        </div>
    )
};
const multiPlatformColumn = {
    key: 'platform',
    label: 'Kênh',
    render: (r) => (
        <div className="multi-platform">
            {r.channels.map((channel) => (
                <Platform key={channel} name={channel} />
            ))}
        </div>
    )
};
const platformColumn = {
    key: 'platform',
    label: 'Kênh',
    render: (r) => <Platform name={r.platform} />
};
const statusColumn = {
    key: 'status',
    label: 'Trạng thái',
    render: (r) => <Badge value={r.status} />
};
const columns = {
    accounts: [
        nameColumn,
        platformColumn,
        statusColumn,
        { key: 'owner', label: 'Người phụ trách' },
        { key: 'created', label: 'Ngày tạo', render: (r) => dateLabel(r.created) }
    ],
    channels: [
        nameColumn,
        platformColumn,
        statusColumn,
        { key: 'followers', label: 'Người theo dõi', render: (r) => number(r.followers) },
        { key: 'owner', label: 'Người phụ trách' }
    ],
    campaigns: [
        {
            key: 'name',
            label: 'Chiến dịch',
            render: (r) => (
                <div className="plain-name">
                    <strong>{r.name}</strong>
                    <small>
                        {dateLabel(r.start)} – {dateLabel(r.end)}
                    </small>
                </div>
            )
        },
        platformColumn,
        statusColumn,
        { key: 'budget', label: 'Ngân sách', render: (r) => money(r.budget) },
        {
            key: 'spent',
            label: 'Đã chi',
            render: (r) => (
                <div className="spend-cell">
                    <span>{money(r.spent)}</span>
                    <Progress value={r.budget ? (r.spent / r.budget) * 100 : 0} />
                </div>
            )
        },
        { key: 'leads', label: 'Khách tiềm năng', render: (r) => number(r.leads) }
    ],
    posts: [
        {
            key: 'name',
            label: 'Bài viết',
            render: (r) => (
                <div className="post-cell">
                    <div
                        className={`post-thumbnail ${r.platform === 'Instagram' ? 'mint' : 'sand'}`}
                    >
                        <FileText size={18} />
                    </div>
                    <div>
                        <strong>{r.name}</strong>
                        <small>{r.campaign || 'Chưa gắn chiến dịch'}</small>
                    </div>
                </div>
            )
        },
        multiPlatformColumn,
        statusColumn,
        {
            key: 'date',
            label: 'Thời gian đăng',
            render: (r) => (
                <div className="plain-name">
                    {dateLabel(r.date)}
                    <small>{r.time} · UTC+7</small>
                </div>
            )
        },
        {
            key: 'engagement',
            label: 'Tương tác',
            render: (r) => (r.status === 'Đã đăng' ? number(r.engagement) : '—')
        }
    ],
    ads: [
        {
            key: 'name',
            label: 'Quảng cáo',
            render: (r) => (
                <div className="plain-name">
                    <strong>{r.name}</strong>
                    <small>{r.campaign}</small>
                </div>
            )
        },
        platformColumn,
        statusColumn,
        { key: 'budget', label: 'Ngân sách / ngày', render: (r) => money(r.budget) },
        { key: 'clicks', label: 'Lượt nhấp', render: (r) => number(r.clicks) },
        { key: 'ctr', label: 'CTR', render: (r) => `${r.ctr}%` }
    ],
    customers: [
        nameColumn,
        platformColumn,
        { key: 'visits', label: 'Lượt truy cập', render: (r) => number(r.visits) },
        { key: 'lead', label: 'Phân loại', render: (r) => <Badge value={r.lead} /> },
        { key: 'last', label: 'Truy cập gần nhất', render: (r) => dateLabel(r.last) }
    ],
    rankings: [
        {
            key: 'name',
            label: 'Từ khóa',
            render: (r) => (
                <div className="plain-name">
                    <strong>{r.name}</strong>
                    <small>{r.url}</small>
                </div>
            )
        },
        {
            key: 'rank',
            label: 'Thứ hạng',
            render: (r) =>
                r.rank ? <span className="rank-position">#{r.rank}</span> : 'Chưa kiểm tra'
        },
        {
            key: 'previous',
            label: 'Thay đổi',
            render: (r) => (
                <span
                    className={
                        r.previous > r.rank
                            ? 'positive'
                            : r.previous < r.rank
                              ? 'negative'
                              : 'muted'
                    }
                >
                    {r.rank === 0 ? (
                        '—'
                    ) : r.previous > r.rank ? (
                        <>
                            <ArrowUpRight size={15} />
                            {r.previous - r.rank}
                        </>
                    ) : r.previous < r.rank ? (
                        <>
                            <ArrowDownRight size={15} />
                            {r.rank - r.previous}
                        </>
                    ) : (
                        '—'
                    )}
                </span>
            )
        },
        { key: 'volume', label: 'Lượt tìm kiếm', render: (r) => number(r.volume) },
        {
            key: 'status',
            label: 'Nhóm',
            render: (r) => (
                <Badge
                    value={r.rank === 0 ? 'Chưa kiểm tra' : r.rank <= 10 ? 'Top 10' : 'Top 20'}
                />
            )
        }
    ],
    competitors: [
        {
            key: 'name',
            label: 'Đối thủ',
            render: (r) => (
                <div className="name-cell">
                    <Avatar name={r.name} />
                    <div>
                        <strong>{r.name}</strong>
                        <small>{r.url}</small>
                    </div>
                </div>
            )
        },
        { key: 'traffic', label: 'Traffic ước tính', render: (r) => number(r.traffic) },
        { key: 'keywords', label: 'Từ khóa', render: (r) => number(r.keywords) },
        {
            key: 'score',
            label: 'Điểm hiển thị',
            render: (r) => (
                <div className="score-cell">
                    {r.score}
                    <Progress value={r.score} />
                </div>
            )
        },
        statusColumn
    ]
};
export function Dashboard() {
    const { data, period, platform, navigate, compose, view } = useWorkspace();
    const active = data.campaigns.filter((c) => c.status === 'Đang chạy');
    const ratio = period === 'week' ? 0.26 : 1;
    const reach = data.campaigns.reduce((sum, c) => sum + c.reach, 0) * ratio;
    const spent = data.campaigns.reduce((sum, c) => sum + c.spent, 0) * ratio;
    const leads = Math.round(data.campaigns.reduce((sum, c) => sum + c.leads, 0) * ratio);
    return (
        <>
            <div className="welcome-strip">
                <div>
                    <span className="welcome-label">
                        <span className="sun-symbol">✳</span> CHÀO LINH, NGÀY MỚI TỐT LÀNH
                    </span>
                    <h2>
                        Những kết nối nhỏ.
                        <br />
                        <span>Tạo nên tác động lớn.</span>
                    </h2>
                    <p>
                        Bạn có {active.length} chiến dịch đang chạy và{' '}
                        {data.posts.filter((p) => p.status === 'Chờ duyệt').length} bài viết cần
                        duyệt.
                    </p>
                    <button className="text-link" onClick={() => navigate('campaigns')}>
                        Khám phá chiến dịch <ArrowRight size={16} />
                    </button>
                </div>
                <div className="welcome-art" aria-hidden="true">
                    <div className="art-orbit orbit-one" />
                    <div className="art-orbit orbit-two" />
                    <div className="art-note">
                        <span>✦</span>
                        <strong>
                            Make
                            <br />
                            connections.
                        </strong>
                        <small>OMNI STUDIO / OCTOBER</small>
                    </div>
                    <div className="art-stamp">
                        stay
                        <br />
                        creative ↗
                    </div>
                </div>
            </div>
            <div className="metrics">
                <Metric
                    label="Tổng lượt tiếp cận"
                    value={compact(reach)}
                    delta="+18,6%"
                    icon={Eye}
                />
                <Metric
                    label="Tương tác nội dung"
                    value={number(
                        Math.round(data.posts.reduce((s, p) => s + p.engagement, 0) * ratio)
                    )}
                    delta="+12,8%"
                    icon={Heart}
                    tone="rose"
                />
                <Metric
                    label="Khách hàng tiềm năng"
                    value={number(leads)}
                    delta="+8,2%"
                    icon={Users}
                    tone="mint"
                />
                <Metric
                    label="Ngân sách đã chi"
                    value={compact(spent) + ' ₫'}
                    delta="-4,3%"
                    icon={Wallet}
                    tone="sand"
                    note="so với kế hoạch demo"
                />
            </div>
            <div className="chart-grid">
                <Panel
                    title="Hiệu suất đa kênh"
                    subtitle="Lượt tiếp cận trong kỳ · Dữ liệu minh họa"
                    action={
                        <div className="chart-legend">
                            <span>
                                <i className="purple-dot" />
                                Kỳ này
                            </span>
                            <span>
                                <i className="mint-dot" />
                                Kỳ trước
                            </span>
                        </div>
                    }
                >
                    <LineChart period={period} platform={platform} />
                    <div className="chart-foot">
                        <span>
                            <TrendingUp size={15} />
                            Tiếp cận tăng đều trong kỳ demo
                        </span>
                        <button className="text-link" onClick={() => navigate('traffic')}>
                            Xem phân tích
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </Panel>
                <Panel title="Phân bổ ngân sách" subtitle="Theo nền tảng · Tháng 10">
                    <BudgetRing campaigns={data.campaigns} />
                    <div className="budget-legend">
                        {['Facebook', 'Instagram', 'TikTok', 'Google'].map((p, i) => (
                            <div key={p}>
                                <span>
                                    <i
                                        style={{
                                            background: [
                                                '#9580e7',
                                                '#efb38a',
                                                '#6ebbb0',
                                                '#91b4e8'
                                            ][i]
                                        }}
                                    />
                                    {p}
                                </span>
                                <strong>
                                    {compact(
                                        data.campaigns
                                            .filter((c) => c.platform === p)
                                            .reduce((s, c) => s + c.budget, 0)
                                    )}{' '}
                                    ₫
                                </strong>
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>
            <div className="dashboard-lower">
                <Panel
                    title="Chiến dịch đang hoạt động"
                    action={
                        <button className="text-link" onClick={() => navigate('campaigns')}>
                            Tất cả chiến dịch
                            <ArrowRight size={14} />
                        </button>
                    }
                >
                    <div className="campaign-list">
                        {active.length ? (
                            active.map((c, i) => (
                                <button key={c.id} onClick={() => view(c)} className="campaign-row">
                                    <span className={`campaign-tile tile-${i % 3}`}>
                                        <Megaphone size={20} />
                                    </span>
                                    <div>
                                        <strong>{c.name}</strong>
                                        <span>
                                            <Platform name={c.platform} small />
                                            {c.platform} · {dateLabel(c.end)}
                                        </span>
                                    </div>
                                    <div className="campaign-progress">
                                        <span>
                                            {number(c.leads)}
                                            <small>khách tiềm năng</small>
                                        </span>
                                        <Progress
                                            value={c.budget ? (c.spent / c.budget) * 100 : 0}
                                        />
                                    </div>
                                    <ChevronRight size={16} />
                                </button>
                            ))
                        ) : (
                            <Empty title="Chưa có chiến dịch đang chạy" />
                        )}
                    </div>
                </Panel>
                <Panel
                    title="Sắp lên sóng"
                    action={
                        <button
                            className="icon-button"
                            aria-label="Mở lịch nội dung"
                            onClick={() => navigate('calendar')}
                        >
                            <CalendarDays size={18} />
                        </button>
                    }
                >
                    <div className="upcoming-list">
                        {data.posts
                            .filter((p) => p.status === 'Đã lên lịch')
                            .sort((a, b) =>
                                `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
                            )
                            .slice(0, 3)
                            .map((p) => (
                                <button
                                    key={p.id}
                                    className="upcoming-row"
                                    onClick={() => compose(p)}
                                >
                                    <span className="date-tile">
                                        <strong>{p.date.slice(-2)}</strong>
                                        <small>TH{Number(p.date.slice(5, 7))}</small>
                                    </span>
                                    <div>
                                        <strong>{p.name}</strong>
                                        <span>
                                            <Platform name={p.platform} small />
                                            {p.time} · {p.platform}
                                        </span>
                                    </div>
                                    <ChevronRight size={15} />
                                </button>
                            ))}
                        {!data.posts.some((p) => p.status === 'Đã lên lịch') && (
                            <Empty
                                title="Lịch đang trống"
                                description="Lên lịch bài viết đầu tiên của bạn."
                            />
                        )}
                    </div>
                    <button className="calendar-link" onClick={() => navigate('calendar')}>
                        Mở lịch nội dung
                        <ArrowRight size={15} />
                    </button>
                </Panel>
            </div>
            <div className="insight-note">
                <span className="insight-star">
                    <Sparkles size={19} />
                </span>
                <div>
                    <strong>Một góc nhìn để bắt đầu</strong>
                    <p>
                        So sánh nội dung có tương tác cao trước khi lên kế hoạch cho bài viết tiếp
                        theo.
                    </p>
                </div>
                <Button onClick={() => navigate('postInsights')}>
                    Khám phá nội dung
                    <ArrowUpRight size={15} />
                </Button>
            </div>
        </>
    );
}
function BudgetRing({ campaigns }) {
    const total = campaigns.reduce((s, c) => s + c.budget, 0);
    const pieces = ['Facebook', 'Instagram', 'TikTok', 'Google', 'Zalo'].map((p) =>
        campaigns.filter((c) => c.platform === p).reduce((s, c) => s + c.budget, 0)
    );
    let offset = 0;
    return (
        <div className="ring-wrap">
            <svg viewBox="0 0 180 180" role="img" aria-label={`Tổng ngân sách ${money(total)}`}>
                <circle cx="90" cy="90" r="68" fill="none" stroke="#f0f1f5" strokeWidth="18" />
                {pieces.map((v, i) => {
                    const length = total ? (v / total) * 427.25 : 0;
                    const current = offset;
                    offset += length;
                    return (
                        <circle
                            key={i}
                            cx="90"
                            cy="90"
                            r="68"
                            fill="none"
                            stroke={['#9580e7', '#efb38a', '#6ebbb0', '#91b4e8', '#ddd6ef'][i]}
                            strokeWidth="18"
                            strokeDasharray={`${Math.max(0, length - 4)} ${427.25 - Math.max(0, length - 4)}`}
                            strokeDashoffset={-current}
                            transform="rotate(-90 90 90)"
                        />
                    );
                })}
            </svg>
            <div>
                <small>Tổng ngân sách</small>
                <strong>{compact(total)}</strong>
                <span>VNĐ</span>
            </div>
        </div>
    );
}
export function EntityPage({ kind }) {
    const { data, edit, remove, compose, navigate, view } = useWorkspace();
    const [tab, setTab] = useState('Tất cả');
    const [layout, setLayout] = useState('list');
    const key = kind === 'rankings' ? 'keywords' : kind;
    const raw = data[key];
    const rows = tab === 'Tất cả' ? raw : raw.filter((r) => r.status === tab);
    const titles = {
        accounts: 'Tài khoản đã liên kết',
        channels: 'Kênh của thương hiệu',
        campaigns: 'Danh sách chiến dịch',
        posts: 'Thư viện bài viết',
        ads: 'Danh sách quảng cáo',
        customers: 'Hành trình khách hàng',
        rankings: 'Từ khóa đang theo dõi'
    };
    const addNames = {
        accounts: 'Thêm tài khoản',
        channels: 'Thêm kênh',
        campaigns: 'Tạo chiến dịch',
        ads: 'Tạo quảng cáo',
        customers: 'Thêm khách hàng',
        rankings: 'Thêm từ khóa'
    };
    return (
        <>
            <div className="section-toolbar">
                <div className="section-summary">
                    <span className="summary-marker" />
                    {raw.length}{' '}
                    {kind === 'posts'
                        ? 'bài viết'
                        : kind === 'channels'
                          ? 'kênh'
                          : kind === 'campaigns'
                            ? 'chiến dịch'
                            : 'mục'}{' '}
                    trong không gian của bạn
                </div>
                <div className="toolbar-right">
                    {kind === 'posts' && (
                        <Button icon={CalendarDays} onClick={() => navigate('calendar')}>
                            Xem lịch
                        </Button>
                    )}
                    {kind === 'channels' && (
                        <div className="segmented">
                            <button
                                className={layout === 'list' ? 'active' : ''}
                                onClick={() => setLayout('list')}
                            >
                                Danh sách
                            </button>
                            <button
                                className={layout === 'grid' ? 'active' : ''}
                                onClick={() => setLayout('grid')}
                            >
                                Thẻ kênh
                            </button>
                        </div>
                    )}
                    {kind !== 'posts' && (
                        <Button kind="primary" icon={Plus} onClick={() => edit(kind)}>
                            {addNames[kind]}
                        </Button>
                    )}
                </div>
            </div>
            {kind === 'campaigns' && (
                <div className="metrics three">
                    <Metric
                        label="Chiến dịch đang chạy"
                        value={raw.filter((c) => c.status === 'Đang chạy').length}
                        delta="Đang hoạt động"
                        note="trong không gian"
                        icon={Megaphone}
                    />
                    <Metric
                        label="Tổng ngân sách"
                        value={compact(raw.reduce((s, c) => s + c.budget, 0)) + ' ₫'}
                        delta="Kế hoạch"
                        note="cho tất cả chiến dịch"
                        icon={Wallet}
                        tone="sand"
                    />
                    <Metric
                        label="Khách hàng tiềm năng"
                        value={number(raw.reduce((s, c) => s + c.leads, 0))}
                        delta="+8,2%"
                        icon={Users}
                        tone="mint"
                    />
                </div>
            )}
            {kind === 'rankings' && (
                <div className="metrics three">
                    <Metric
                        label="Từ khóa theo dõi"
                        value={raw.length}
                        delta="Google"
                        note="dữ liệu demo"
                        icon={Search}
                    />
                    <Metric
                        label="Từ khóa trong Top 10"
                        value={raw.filter((k) => k.rank > 0 && k.rank <= 10).length}
                        delta="Hiển thị tốt"
                        note="trong tìm kiếm demo"
                        icon={TrendingUp}
                        tone="mint"
                    />
                    <Metric
                        label="Từ khóa tăng hạng"
                        value={raw.filter((k) => k.previous > k.rank && k.rank > 0).length}
                        delta="Xu hướng tích cực"
                        note="so với kỳ trước"
                        icon={ArrowUpRight}
                        tone="sand"
                    />
                </div>
            )}
            {kind === 'channels' && layout === 'grid' ? (
                <div className="channel-grid">
                    {raw.map((c, i) => (
                        <article className="panel channel-card" key={c.id}>
                            <div>
                                <Platform name={c.platform} />
                                <button
                                    className="icon-button"
                                    aria-label={`Chỉnh sửa ${c.name}`}
                                    onClick={() => edit(kind, c)}
                                >
                                    <Settings2 size={17} />
                                </button>
                            </div>
                            <h2>{c.name}</h2>
                            <p>{c.url}</p>
                            <Badge value={c.status} />
                            <div className="channel-stat">
                                <strong>{number(c.followers)}</strong>
                                <span>người theo dõi · demo</span>
                            </div>
                            <div className="channel-footer">
                                <Avatar name={c.owner} size="small" tone={i} />
                                <span>{c.owner}</span>
                                <Button onClick={() => edit(kind, c)}>Quản lý</Button>
                            </div>
                        </article>
                    ))}
                </div>
            ) : (
                <DataTable
                    key={kind}
                    title={titles[kind]}
                    name={kind}
                    rows={rows}
                    columns={columns[kind]}
                    tabs={
                        kind === 'posts'
                            ? ['Tất cả', 'Bản nháp', 'Chờ duyệt', 'Đã lên lịch', 'Đã đăng']
                            : kind === 'campaigns'
                              ? ['Tất cả', 'Đang chạy', 'Tạm dừng', 'Bản nháp']
                              : null
                    }
                    activeTab={tab}
                    onTab={setTab}
                    onEdit={(r) => (kind === 'posts' ? compose(r) : edit(kind, r))}
                    onDelete={(ids) => remove(kind, ids)}
                />
            )}
            {kind === 'accounts' && (
                <div className="info-note">
                    <ShieldIcon />
                    Thông tin kết nối trong bản mẫu chưa đại diện cho phiên OAuth thật. Token
                    Facebook được cấu hình riêng trên máy chủ.
                </div>
            )}
        </>
    );
}
function ShieldIcon() {
    return <Link2 size={17} />;
}
export function Analytics({ kind }) {
    const { data, period, platform, edit, remove, view, navigate } = useWorkspace();
    const [channel, setChannel] = useState('');
    const [competitor, setCompetitor] = useState('');
    const campaigns = data.campaigns.filter((c) => !channel || c.platform === channel);
    const posts = data.posts.filter(
        (p) => p.status === 'Đã đăng' && (!channel || p.platform === channel)
    );
    const budget = campaigns.reduce((s, c) => s + c.budget, 0);
    const spent = campaigns.reduce((s, c) => s + c.spent, 0);
    const reach = campaigns.reduce((s, c) => s + c.reach, 0);
    const leads = campaigns.reduce((s, c) => s + c.leads, 0);
    const comparison = data.competitors.filter((c) => !competitor || c.id === competitor);
    const ratio = period === 'week' ? 0.26 : 1;
    const metrics =
        kind === 'performance'
            ? [
                  ['Tổng ngân sách', compact(budget) + ' ₫', '+12,4%', Wallet],
                  ['Chi phí trong kỳ', compact(spent * ratio) + ' ₫', '-4,3%', Target],
                  ['Khách tiềm năng', number(Math.round(leads * ratio)), '+8,2%', Users],
                  [
                      'Chi phí / khách tiềm năng',
                      leads ? compact(spent / leads) + ' ₫' : '—',
                      '-6,1%',
                      MousePointer2
                  ]
              ]
            : kind === 'traffic'
              ? [
                    ['Lượt tiếp cận', compact(reach * ratio), '+18,6%', Eye],
                    ['Lượt truy cập', number(Math.round(reach * 0.16 * ratio)), '+14,2%', Globe2],
                    ['Thời gian trung bình', '02:48', '+12,8%', Clock3],
                    ['Tỷ lệ chuyển đổi', '4,82%', '+0,6%', Target]
                ]
              : kind === 'postInsights'
                ? [
                      ['Bài đã đăng', posts.length, 'Trong không gian', FileText],
                      [
                          'Tổng tiếp cận',
                          compact(posts.reduce((s, p) => s + p.reach, 0) * ratio),
                          '+16,8%',
                          Eye
                      ],
                      [
                          'Tổng tương tác',
                          number(Math.round(posts.reduce((s, p) => s + p.engagement, 0) * ratio)),
                          '+12,8%',
                          Heart
                      ],
                      [
                          'Tỷ lệ tương tác',
                          posts.reduce((s, p) => s + p.reach, 0)
                              ? (
                                    (posts.reduce((s, p) => s + p.engagement, 0) /
                                        posts.reduce((s, p) => s + p.reach, 0)) *
                                    100
                                ).toFixed(2) + '%'
                              : '—',
                          '+0,4%',
                          MessageCircle
                      ]
                  ]
                : [
                      ['Đối thủ theo dõi', comparison.length, 'Đang theo dõi', Users],
                      ['Traffic của thương hiệu', '98,4 N', '+18,6%', Globe2],
                      [
                          'Từ khóa Top 10',
                          data.keywords.filter((k) => k.rank <= 10 && k.rank > 0).length,
                          '+Xu hướng',
                          Search
                      ],
                      ['Điểm hiển thị', '78 / 100', '+6 điểm', TrendingUp]
                  ];
    return (
        <>
            <div className="section-toolbar">
                <span className="section-summary">
                    <BarChart3 size={17} />
                    Báo cáo tổng hợp · Chỉ số demo
                </span>
                <div className="toolbar-right">
                    {kind === 'competitors' ? (
                        <>
                            <select
                                aria-label="Chọn đối thủ"
                                value={competitor}
                                onChange={(e) => setCompetitor(e.target.value)}
                            >
                                <option value="">Tất cả đối thủ</option>
                                {data.competitors.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                            <Button icon={Plus} kind="primary" onClick={() => edit('competitors')}>
                                Thêm đối thủ
                            </Button>
                        </>
                    ) : (
                        <select
                            aria-label="Kênh phân tích"
                            value={channel}
                            onChange={(e) => setChannel(e.target.value)}
                        >
                            <option value="">Tất cả kênh</option>
                            {window.Omni.platforms.map((p) => (
                                <option key={p}>{p}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>
            <div className="metrics">
                {metrics.map(([label, value, delta, icon], i) => (
                    <Metric
                        key={label}
                        label={label}
                        value={value}
                        delta={delta}
                        icon={icon}
                        tone={['purple', 'sand', 'mint', 'rose'][i]}
                        note="trong báo cáo demo"
                    />
                ))}
            </div>
            <div className="chart-grid">
                <Panel
                    title={
                        kind === 'performance'
                            ? 'Hiệu suất đầu tư'
                            : kind === 'competitors'
                              ? 'Xu hướng traffic thị trường'
                              : kind === 'postInsights'
                                ? 'Tương tác theo thời gian'
                                : 'Xu hướng truy cập'
                    }
                    subtitle="Dữ liệu minh họa · Không phải dữ liệu đồng bộ trực tiếp"
                    action={
                        <div className="chart-legend">
                            <span>
                                <i className="purple-dot" />
                                {kind === 'competitors' ? 'Omni Studio' : 'Kỳ này'}
                            </span>
                            <span>
                                <i className="mint-dot" />
                                {kind === 'competitors'
                                    ? comparison[0]?.name || 'Đối thủ'
                                    : 'Kỳ trước'}
                            </span>
                        </div>
                    }
                >
                    <LineChart
                        period={period}
                        platform={channel}
                        compare={kind === 'competitors'}
                    />
                </Panel>
                <Panel
                    title={
                        kind === 'performance'
                            ? 'Mức sử dụng ngân sách'
                            : kind === 'competitors'
                              ? 'Điểm hiển thị'
                              : 'Đóng góp theo kênh'
                    }
                    subtitle="Tổng hợp trong kỳ"
                >
                    <div className="breakdown-list">
                        {kind === 'competitors'
                            ? [{ id: 'ours', name: 'Omni Studio', score: 78 }, ...comparison].map(
                                  (c, i) => (
                                      <div key={c.id}>
                                          <div>
                                              <strong>{c.name}</strong>
                                              <span>{c.score}/100</span>
                                          </div>
                                          <Progress
                                              value={c.score}
                                              color={i ? '#83bdb1' : '#9683e4'}
                                          />
                                      </div>
                                  )
                              )
                            : data.channels
                                  .filter((c) => !channel || c.platform === channel)
                                  .map((c, i) => {
                                      const related = campaigns.filter(
                                          (cp) => cp.platform === c.platform
                                      );
                                      const share =
                                          kind === 'performance'
                                              ? (related.reduce((s, cp) => s + cp.spent, 0) /
                                                    (related.reduce((s, cp) => s + cp.budget, 0) ||
                                                        1)) *
                                                100
                                              : [32, 26, 18, 14, 6, 4][i];
                                      return (
                                          <div key={c.id}>
                                              <div>
                                                  <Platform name={c.platform} />
                                                  <strong>{Math.round(share)}%</strong>
                                              </div>
                                              <Progress
                                                  value={share}
                                                  color={
                                                      ['#9683e4', '#efb38a', '#83bdb1', '#91b4e8'][
                                                          i % 4
                                                      ]
                                                  }
                                              />
                                          </div>
                                      );
                                  })}
                    </div>
                </Panel>
            </div>
            {kind === 'performance' ? (
                <DataTable
                    title="Ngân sách theo chiến dịch"
                    name="ngan-sach"
                    rows={campaigns}
                    columns={columns.campaigns}
                    onView={view}
                />
            ) : kind === 'postInsights' ? (
                <DataTable
                    title="Hiệu suất bài viết"
                    name="hieu-suat-noi-dung"
                    rows={posts}
                    columns={[
                        ...columns.posts.slice(0, 2),
                        { key: 'reach', label: 'Lượt tiếp cận', render: (r) => number(r.reach) },
                        ...columns.posts.slice(4)
                    ]}
                    onView={view}
                />
            ) : kind === 'competitors' ? (
                <DataTable
                    title="Đối thủ đang theo dõi"
                    name="doi-thu"
                    rows={comparison}
                    columns={columns.competitors}
                    onEdit={(r) => edit('competitors', r)}
                    onDelete={(ids) => remove('competitors', ids)}
                />
            ) : (
                <DataTable
                    title="Traffic theo kênh"
                    name="traffic-kenh"
                    rows={data.channels
                        .filter((c) => !channel || c.platform === channel)
                        .map((c, i) => ({
                            ...c,
                            visits: Math.round([18450, 12820, 24360, 9460, 3120, 2840][i] * ratio),
                            conversion: [4.8, 3.6, 5.2, 2.8, 1.9, 3.4][i],
                            source: [
                                'Social',
                                'Social',
                                'Organic Search',
                                'Social',
                                'Video',
                                'Direct'
                            ][i]
                        }))}
                    columns={[
                        nameColumn,
                        platformColumn,
                        { key: 'source', label: 'Nguồn truy cập' },
                        { key: 'visits', label: 'Lượt truy cập', render: (r) => number(r.visits) },
                        {
                            key: 'conversion',
                            label: 'Chuyển đổi',
                            render: (r) => r.conversion + '%'
                        }
                    ]}
                    onView={view}
                />
            )}
        </>
    );
}
export function Calendar() {
    const { data, compose } = useWorkspace();
    const [start, setStart] = useState('2026-10-12');
    const [layout, setLayout] = useState('week');
    const [platform, setPlatform] = useState('');
    const [status, setStatus] = useState('');
    const posts = data.posts.filter(
        (p) => (!platform || p.channels.includes(platform)) && (!status || p.status === status)
    );
    function shift(amount) {
        const d = new Date(start + 'T12:00:00');
        if (layout === 'month') d.setMonth(d.getMonth() + amount, 1);
        else d.setDate(d.getDate() + amount * 7);
        setStart(d.toISOString().slice(0, 10));
    }
    const startDate = new Date(start + 'T12:00:00');
    const days =
        layout === 'month'
            ? Array.from(
                  {
                      length: new Date(
                          startDate.getFullYear(),
                          startDate.getMonth() + 1,
                          0
                      ).getDate()
                  },
                  (_, i) => `${start.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`
              )
            : Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(start + 'T12:00:00');
                  d.setDate(d.getDate() + i);
                  return d.toISOString().slice(0, 10);
              });
    const blanks = layout === 'month' ? (new Date(days[0] + 'T12:00:00').getDay() + 6) % 7 : 0;
    return (
        <>
            <div className="calendar-toolbar">
                <div className="calendar-month">
                    <button className="icon-button" onClick={() => shift(-1)} aria-label="Kỳ trước">
                        <ChevronLeft size={18} />
                    </button>
                    <h2>
                        Tháng {startDate.getMonth() + 1}, {startDate.getFullYear()}
                    </h2>
                    <button className="icon-button" onClick={() => shift(1)} aria-label="Kỳ sau">
                        <ChevronRight size={18} />
                    </button>
                    <Button onClick={() => setStart(new Date().toISOString().slice(0, 10))}>
                        Hôm nay
                    </Button>
                </div>
                <div className="toolbar-right">
                    <select
                        aria-label="Lọc lịch theo kênh"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                    >
                        <option value="">Tất cả kênh</option>
                        {window.Omni.platforms.map((p) => (
                            <option key={p}>{p}</option>
                        ))}
                    </select>
                    <select
                        aria-label="Trạng thái bài trên lịch"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                    >
                        <option value="">Mọi trạng thái</option>
                        {['Bản nháp', 'Chờ duyệt', 'Đã lên lịch', 'Đã đăng'].map((s) => (
                            <option key={s}>{s}</option>
                        ))}
                    </select>
                    <div className="segmented">
                        <button
                            className={layout === 'week' ? 'active' : ''}
                            onClick={() => setLayout('week')}
                        >
                            Tuần
                        </button>
                        <button
                            className={layout === 'month' ? 'active' : ''}
                            onClick={() => setLayout('month')}
                        >
                            Tháng
                        </button>
                    </div>
                </div>
            </div>
            <div className={`calendar-board panel ${layout}`}>
                <div className="calendar-grid">
                    {layout === 'month' &&
                        ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
                            <div className="month-label" key={d}>
                                {d}
                            </div>
                        ))}
                    {Array.from({ length: blanks }, (_, i) => (
                        <div className="calendar-blank" key={`blank-${i}`} />
                    ))}
                    {days.map((date) => {
                        const dayPosts = posts.filter((p) => p.date === date);
                        return (
                            <div
                                className={`calendar-day ${date === window.Omni.today ? 'today' : ''}`}
                                key={date}
                            >
                                <div className="calendar-day-head">
                                    <span>
                                        {new Date(date + 'T12:00:00').toLocaleDateString('vi-VN', {
                                            weekday: 'short'
                                        })}
                                    </span>
                                    <strong>{date.slice(-2)}</strong>
                                    <button
                                        className="icon-button"
                                        aria-label={`Thêm bài ngày ${dateLabel(date)}`}
                                        onClick={() => compose({ date, time: '09:00' })}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <div className="day-posts">
                                    {dayPosts.map((p) => (
                                        <button
                                            className={`calendar-post ${p.platform.toLowerCase()}`}
                                            key={p.id}
                                            onClick={() => compose(p)}
                                        >
                                            <div>
                                                <Platform name={p.platform} small />
                                                <span>{p.time}</span>
                                            </div>
                                            <strong>{p.name}</strong>
                                            <div
                                                className={`mini-art ${p.platform === 'Instagram' ? 'mint' : 'sand'}`}
                                            >
                                                <span>
                                                    {p.platform === 'TikTok'
                                                        ? 'creative\ndays.'
                                                        : 'a little\ninspiration.'}
                                                </span>
                                                <span>✳</span>
                                            </div>
                                            <span className="calendar-post-status">
                                                <i />
                                                {p.status}
                                            </span>
                                        </button>
                                    ))}
                                    {!dayPosts.length && (
                                        <button
                                            className="empty-day"
                                            onClick={() => compose({ date, time: '09:00' })}
                                        >
                                            <Plus size={18} />
                                            <span>Thêm nội dung</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="calendar-caption">
                <span>
                    <i className="purple-dot" />
                    Đã lên lịch
                </span>
                <span>
                    <i className="amber-dot" />
                    Chờ duyệt
                </span>
                <span>
                    <i className="mint-dot" />
                    Đã đăng
                </span>
                <span className="muted">Lịch demo · Chưa có worker tự đăng</span>
            </div>
        </>
    );
}
export function InboxPage() {
    const { data, update, saving, notify } = useWorkspace();
    const [selected, setSelected] = useState(data.conversations[0]?.id);
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState('Tất cả');
    const [reply, setReply] = useState('');
    const [details, setDetails] = useState(false);
    const [mobileChat, setMobileChat] = useState(false);
    const conversation = data.conversations.find((c) => c.id === selected);
    const filtered = data.conversations.filter(
        (c) =>
            (tab === 'Tất cả' || c.status === tab) &&
            c.name.toLowerCase().includes(query.toLowerCase())
    );
    const messagesRef = React.useRef(null);
    useEffect(() => {
        messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
    }, [selected, conversation?.messages.length]);
    async function send(e) {
        e.preventDefault();
        if (!reply.trim() || !conversation) return;
        const message = {
            from: 'agent',
            text: reply.trim(),
            time: new Date().toLocaleTimeString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                hour: '2-digit',
                minute: '2-digit'
            })
        };
        if (
            await update(
                {
                    ...data,
                    conversations: data.conversations.map((c) =>
                        c.id === selected ? { ...c, messages: [...c.messages, message] } : c
                    )
                },
                'Đã lưu phản hồi demo · Không gửi ra nền tảng'
            )
        )
            setReply('');
    }
    return (
        <div
            className={`inbox-layout panel ${mobileChat ? 'show-chat' : ''} ${details ? 'show-details' : ''}`}
        >
            <section className="conversation-list">
                <div className="inbox-list-head">
                    <h2>
                        Hội thoại <span className="count">{data.conversations.length}</span>
                    </h2>
                    <label className="search-field">
                        <Search size={16} />
                        <input
                            aria-label="Tìm hội thoại"
                            placeholder="Tìm khách hàng…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </label>
                    <div className="inbox-tabs">
                        {['Tất cả', 'Chưa xử lý', 'Đã xử lý'].map((t) => (
                            <button
                                key={t}
                                className={tab === t ? 'active' : ''}
                                onClick={() => setTab(t)}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
                {filtered.map((c, i) => (
                    <button
                        className={`conversation ${selected === c.id ? 'selected' : ''}`}
                        key={c.id}
                        onClick={() => {
                            setSelected(c.id);
                            setMobileChat(true);
                            setReply('');
                        }}
                    >
                        <div className="avatar-with-platform">
                            <Avatar name={c.name} tone={i} />
                            <Platform name={c.platform} small />
                        </div>
                        <div>
                            <div>
                                <strong>{c.name}</strong>
                                <small>{c.time}</small>
                            </div>
                            <p>{c.messages[c.messages.length - 1]?.text}</p>
                            <span className={c.status === 'Đã xử lý' ? 'positive' : 'muted'}>
                                {c.status === 'Đã xử lý' ? (
                                    <CheckCheck size={12} />
                                ) : (
                                    <span className="online-dot" />
                                )}
                                {c.status}
                            </span>
                        </div>
                    </button>
                ))}
                {!filtered.length && (
                    <Empty title="Không có hội thoại" description="Thử bộ lọc khác." />
                )}
            </section>
            {conversation ? (
                <>
                    <section className="chat-pane">
                        <div className="chat-head">
                            <button
                                className="icon-button chat-back"
                                onClick={() => setMobileChat(false)}
                                aria-label="Về danh sách hội thoại"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <Avatar name={conversation.name} size="small" />
                            <div>
                                <strong>{conversation.name}</strong>
                                <small>
                                    <Platform name={conversation.platform} small />
                                    {conversation.platform} · Hội thoại demo
                                </small>
                            </div>
                            <div className="chat-head-actions">
                                <Button
                                    disabled={saving}
                                    icon={Check}
                                    onClick={() =>
                                        update(
                                            {
                                                ...data,
                                                conversations: data.conversations.map((c) =>
                                                    c.id === selected
                                                        ? {
                                                              ...c,
                                                              status:
                                                                  c.status === 'Đã xử lý'
                                                                      ? 'Chưa xử lý'
                                                                      : 'Đã xử lý'
                                                          }
                                                        : c
                                                )
                                            },
                                            'Đã cập nhật trạng thái hội thoại'
                                        )
                                    }
                                >
                                    {conversation.status === 'Đã xử lý'
                                        ? 'Mở lại'
                                        : 'Đánh dấu xử lý'}
                                </Button>
                                <button
                                    className="icon-button"
                                    aria-label="Thông tin khách hàng"
                                    onClick={() => setDetails(!details)}
                                >
                                    <Users size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="chat-messages" ref={messagesRef}>
                            <div className="message-date">Hôm nay · Bản demo</div>
                            {conversation.messages.map((m, i) => (
                                <div key={i} className={`message ${m.from}`}>
                                    <p>{m.text}</p>
                                    <span>
                                        {m.time}
                                        {m.from === 'agent' && <CheckCheck size={13} />}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <form className="reply-box" onSubmit={send}>
                            <div className="reply-label">
                                <strong>Phản hồi</strong>
                                <span>Chỉ lưu trong không gian demo</span>
                            </div>
                            <textarea
                                aria-label="Nội dung phản hồi"
                                placeholder="Viết lời phản hồi của bạn…"
                                value={reply}
                                maxLength={4000}
                                onChange={(e) => setReply(e.target.value)}
                                onKeyDown={(e) => {
                                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(e);
                                }}
                            />
                            <div>
                                <span className="muted">Ctrl + Enter để lưu</span>
                                <Button
                                    type="submit"
                                    kind="primary"
                                    icon={Send}
                                    disabled={!reply.trim() || saving}
                                >
                                    {saving ? 'Đang lưu…' : 'Lưu phản hồi'}
                                </Button>
                            </div>
                        </form>
                    </section>
                    <aside className="contact-pane">
                        <button
                            className="icon-button contact-close"
                            onClick={() => setDetails(false)}
                            aria-label="Đóng thông tin"
                        >
                            <X size={18} />
                        </button>
                        <Avatar name={conversation.name} size="large" />
                        <h3>{conversation.name}</h3>
                        <span>Khách hàng · Demo</span>
                        <div className="contact-section">
                            <h4>Thông tin liên hệ</h4>
                            <p>
                                <Platform name={conversation.platform} />
                            </p>
                            <p>
                                {data.customers.find((c) => c.name === conversation.name)?.email ||
                                    'Chưa có email'}
                            </p>
                        </div>
                        <div className="contact-section">
                            <h4>Người phụ trách</h4>
                            <div className="name-cell">
                                <Avatar name="Linh Nguyễn" size="small" />
                                <strong>Linh Nguyễn</strong>
                            </div>
                        </div>
                        <div className="contact-section">
                            <h4>Trạng thái</h4>
                            <Badge value={conversation.status} />
                        </div>
                        <div className="contact-section">
                            <h4>Ghi chú</h4>
                            <p>Quan tâm nội dung và bộ sưu tập mới của thương hiệu.</p>
                        </div>
                    </aside>
                </>
            ) : (
                <Empty title="Chọn một hội thoại" />
            )}
        </div>
    );
}
export function RankCheck() {
    const { data, update, saving } = useWorkspace();
    const [keyword, setKeyword] = useState('');
    const [domain, setDomain] = useState('omni.studio');
    const [region, setRegion] = useState('Việt Nam');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    async function check(e) {
        e.preventDefault();
        setError('');
        if (!keyword.trim() || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain.trim())) {
            setError('Nhập từ khóa và tên miền hợp lệ, ví dụ omni.studio.');
            return;
        }
        setBusy(true);
        const rank = (keyword.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 20) + 1;
        const record = {
            id: crypto.randomUUID(),
            name: keyword.trim(),
            url: domain.trim(),
            platform: 'Google',
            region,
            rank,
            date: new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            status: 'Kết quả mô phỏng'
        };
        try {
            await new Promise((resolve) => setTimeout(resolve, 350));
            if (
                await update(
                    { ...data, rankChecks: [record, ...data.rankChecks] },
                    'Đã lưu kết quả mô phỏng'
                )
            )
                setResult(record);
            else setError('Không thể lưu lịch sử kiểm tra.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <div className="rank-check-layout">
                <Panel
                    title="Kiểm tra thứ hạng từ khóa"
                    subtitle="Mô phỏng quy trình kiểm tra · Chưa kết nối dịch vụ SERP"
                >
                    <form className="rank-form" onSubmit={check}>
                        <label>
                            Từ khóa mục tiêu
                            <input
                                required
                                maxLength="180"
                                placeholder="Ví dụ: tiếp thị đa kênh"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                            />
                        </label>
                        <label>
                            Tên miền
                            <input
                                required
                                placeholder="omni.studio"
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                            />
                        </label>
                        <div className="form-grid">
                            <label>
                                Khu vực
                                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                                    <option>Việt Nam</option>
                                    <option>Hồ Chí Minh</option>
                                    <option>Hà Nội</option>
                                </select>
                            </label>
                            <label>
                                Công cụ tìm kiếm
                                <select aria-label="Công cụ tìm kiếm">
                                    <option>Google</option>
                                </select>
                            </label>
                        </div>
                        {error && (
                            <p className="form-error" role="alert">
                                {error}
                            </p>
                        )}
                        <Button
                            kind="primary"
                            icon={Search}
                            type="submit"
                            disabled={busy || saving}
                        >
                            {busy ? 'Đang mô phỏng…' : 'Chạy kiểm tra demo'}
                        </Button>
                    </form>
                </Panel>
                <section className="rank-result panel">
                    {result ? (
                        <>
                            <span className="eyebrow">KẾT QUẢ MÔ PHỎNG</span>
                            <div className="rank-big">
                                #{result.rank}
                                <ArrowUpRight size={32} />
                            </div>
                            <h2>{result.name}</h2>
                            <p>
                                {result.url} · {result.region}
                            </p>
                            <Badge value={result.rank <= 10 ? 'Top 10' : 'Top 20'} />
                            <p className="hint">
                                Kết quả được tạo từ dữ liệu mẫu, không phải thứ hạng Google thực tế.
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="rank-illustration">
                                <Search size={42} />
                                <span>01</span>
                                <span>02</span>
                                <span>03</span>
                            </div>
                            <h2>Một vị trí. Nhiều cơ hội.</h2>
                            <p>Nhập từ khóa để trải nghiệm quy trình kiểm tra và lưu lịch sử.</p>
                        </>
                    )}
                </section>
            </div>
            <DataTable
                title="Lịch sử kiểm tra"
                name="lich-su-thu-hang"
                rows={data.rankChecks}
                columns={[
                    { key: 'name', label: 'Từ khóa' },
                    { key: 'url', label: 'Tên miền' },
                    { key: 'region', label: 'Khu vực' },
                    { key: 'rank', label: 'Thứ hạng demo', render: (r) => '#' + r.rank },
                    { key: 'date', label: 'Ngày kiểm tra' }
                ]}
            />
        </>
    );
}
export function Workflows() {
    return (
        <>
            <div className="workflow-intro">
                <span className="workflow-emblem">
                    <Workflow size={30} />
                </span>
                <div>
                    <h2>Tự động hóa có chủ đích.</h2>
                    <p>
                        n8n điều phối workflow; Robot Framework thực hiện các tác vụ RPA bằng code.
                    </p>
                </div>
                <span className="badge gray">Cấu hình tích hợp</span>
            </div>
            <div className="workflow-grid">
                <Panel title="n8n · Visual Workflow" subtitle="Self-hosted · Docker Compose">
                    <div className="workflow-flow">
                        <span>
                            <FileText />
                            Nội dung
                        </span>
                        <ArrowRight />
                        <span>
                            <Check />
                            Duyệt
                        </span>
                        <ArrowRight />
                        <span>
                            <CalendarDays />
                            Lên lịch
                        </span>
                    </div>
                    <p className="workflow-description">
                        Workflow mẫu tạo bản ghi duyệt nội dung. Chưa bật lịch chạy tự động hoặc
                        đăng lên nền tảng.
                    </p>
                    <a
                        className="button primary"
                        href="http://localhost:5678"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Mở n8n
                        <ExternalLink size={16} />
                    </a>
                    <p className="hint">
                        Chạy Docker Compose trước khi mở. Import file workflow trong thư mục
                        BE/workflows/.
                    </p>
                </Panel>
                <Panel title="Robot Framework · RPA" subtitle="Heavy-code automation">
                    <div className="robot-code">
                        <span>*** Test Cases ***</span>
                        <br />
                        Open Marketing Workspace
                        <br />
                        <i> Open Browser http://localhost:3000</i>
                        <br />
                        <i> Page Should Contain Omni Workspace</i>
                    </div>
                    <p className="workflow-description">
                        Kịch bản mẫu mở dashboard và kiểm tra giao diện bằng trình duyệt. Không thao
                        tác đăng bài thật.
                    </p>
                    <a className="button" href="/api/rpa-example" download="workspace.robot">
                        <Download size={16} />
                        Tải kịch bản Robot
                    </a>
                    <p className="hint">
                        Cần Python, Robot Framework và SeleniumLibrary để chạy độc lập.
                    </p>
                </Panel>
            </div>
            <div className="info-note">
                <Workflow size={18} />
                Trình lên lịch trong UI hiện lưu trạng thái nội dung. Kết nối worker đăng bài và thu
                thập chỉ số là bước tích hợp tiếp theo.
            </div>
        </>
    );
}

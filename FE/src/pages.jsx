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
import Administration from './Administration.jsx';
import DatabaseAnalytics, { StoredTrend } from './DatabaseAnalytics.jsx';
import { authRequest } from './Auth.jsx';
import {
    Avatar,
    Badge,
    Button,
    DataTable,
    Empty,
    LineChart,
    Metric,
    Panel,
    Modal,
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
                        delta=""
                        note="trong không gian"
                        icon={Megaphone}
                    />
                    <Metric
                        label="Tổng ngân sách"
                        value={compact(raw.reduce((s, c) => s + c.budget, 0)) + ' ₫'}
                        delta=""
                        note="cho tất cả chiến dịch"
                        icon={Wallet}
                        tone="sand"
                    />
                    <Metric
                        label="Khách hàng tiềm năng"
                        value={number(raw.reduce((s, c) => s + c.leads, 0))}
                        delta=""
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
                        delta=""
                        note="dữ liệu demo"
                        icon={Search}
                    />
                    <Metric
                        label="Từ khóa trong Top 10"
                        value={raw.filter((k) => k.rank > 0 && k.rank <= 10).length}
                        delta=""
                        note="trong tìm kiếm demo"
                        icon={TrendingUp}
                        tone="mint"
                    />
                    <Metric
                        label="Từ khóa tăng hạng"
                        value={raw.filter((k) => k.previous > k.rank && k.rank > 0).length}
                        delta=""
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
                            ? [
                                  'Tất cả',
                                  'Bản nháp',
                                  'Chờ duyệt',
                                  'Đã lên lịch',
                                  'Đã đăng',
                                  'Đã hủy'
                              ]
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
    return <DatabaseAnalytics kind={kind} />;
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
    const { data, update, saving, notify, user } = useWorkspace();
    const [creating, setCreating] = useState(false),
        [newContact, setNewContact] = useState({
            name: '',
            platform: 'Facebook',
            customerId: '',
            note: ''
        });
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
                'Đã lưu phản hồi nội bộ · Chưa gửi ra nền tảng'
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
                    {user.role !== 'viewer' && (
                        <Button icon={Plus} onClick={() => setCreating(true)}>
                            Tạo hội thoại nội bộ
                        </Button>
                    )}
                    {creating && (
                        <Modal title="Tạo hội thoại nội bộ" onClose={() => setCreating(false)}>
                            <form
                                className="dialog-body"
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    const customer = data.customers.find(
                                        (c) => c.id === newContact.customerId
                                    );
                                    const row = {
                                        ...newContact,
                                        name: customer?.name || newContact.name.trim(),
                                        platform: customer?.platform || newContact.platform,
                                        id: crypto.randomUUID(),
                                        owner: user.name,
                                        time: new Date().toLocaleTimeString('vi-VN', {
                                            timeZone: 'Asia/Ho_Chi_Minh',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        }),
                                        status: 'Chưa xử lý',
                                        messages: []
                                    };
                                    if (
                                        await update(
                                            {
                                                ...data,
                                                conversations: [...data.conversations, row]
                                            },
                                            'Đã tạo hội thoại nội bộ'
                                        )
                                    ) {
                                        setSelected(row.id);
                                        setCreating(false);
                                        setNewContact({
                                            name: '',
                                            platform: 'Facebook',
                                            customerId: '',
                                            note: ''
                                        });
                                    }
                                }}
                            >
                                <label>
                                    Khách hàng đã lưu
                                    <select
                                        value={newContact.customerId}
                                        onChange={(e) =>
                                            setNewContact({
                                                ...newContact,
                                                customerId: e.target.value
                                            })
                                        }
                                    >
                                        <option value="">Nhập tên mới</option>
                                        {data.customers.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Tên liên hệ
                                    <input
                                        required={!newContact.customerId}
                                        maxLength={180}
                                        value={newContact.name}
                                        onChange={(e) =>
                                            setNewContact({ ...newContact, name: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    Kênh
                                    <select
                                        value={newContact.platform}
                                        onChange={(e) =>
                                            setNewContact({
                                                ...newContact,
                                                platform: e.target.value
                                            })
                                        }
                                    >
                                        {window.Omni.platforms.map((p) => (
                                            <option key={p}>{p}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Ghi chú
                                    <textarea
                                        value={newContact.note}
                                        onChange={(e) =>
                                            setNewContact({ ...newContact, note: e.target.value })
                                        }
                                    />
                                </label>
                                <p className="hint">
                                    Hội thoại nội bộ được lưu trong database; chưa gửi hoặc nhận tin
                                    nhắn từ nhà cung cấp.
                                </p>
                                <Button type="submit" disabled={saving}>
                                    Tạo hội thoại
                                </Button>
                            </form>
                        </Modal>
                    )}
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
                                    {conversation.platform} · Hội thoại nội bộ
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
                            <div className="message-date">Hội thoại nội bộ</div>
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
                                <span>Lưu trong PostgreSQL · Chưa gửi ra nền tảng</span>
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
                        <span>Khách hàng · Hội thoại nội bộ</span>
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
                                <Avatar
                                    name={conversation.owner || 'Chưa phân công'}
                                    size="small"
                                />
                                <strong>{conversation.owner || 'Chưa phân công'}</strong>
                            </div>
                        </div>
                        <div className="contact-section">
                            <h4>Trạng thái</h4>
                            <Badge value={conversation.status} />
                        </div>
                        <div className="contact-section">
                            <h4>Ghi chú</h4>
                            <p>{conversation.note || 'Chưa có ghi chú.'}</p>
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
        const rank = 0;
        const record = {
            id: crypto.randomUUID(),
            name: keyword.trim(),
            url: domain.trim(),
            platform: 'Google',
            region,
            rank,
            date: new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            status: 'Chờ kết nối SERP'
        };
        try {
            await new Promise((resolve) => setTimeout(resolve, 350));
            if (
                await update(
                    { ...data, rankChecks: [record, ...data.rankChecks] },
                    'Đã lưu yêu cầu kiểm tra · Chưa có kết quả SERP'
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
                    subtitle="Lưu yêu cầu và lịch sử · Chưa kết nối dịch vụ SERP"
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
                            {busy ? 'Đang lưu…' : 'Lưu yêu cầu kiểm tra'}
                        </Button>
                    </form>
                </Panel>
                <section className="rank-result panel">
                    {result ? (
                        <>
                            <span className="eyebrow">YÊU CẦU ĐÃ LƯU</span>
                            <div className="rank-big">
                                {result.rank ? '#' + result.rank : 'Chờ dữ liệu'}
                                <ArrowUpRight size={32} />
                            </div>
                            <h2>{result.name}</h2>
                            <p>
                                {result.url} · {result.region}
                            </p>
                            <Badge value={result.status} />
                            <p className="hint">
                                Yêu cầu được lưu trong database. Kết quả sẽ có khi kết nối adapter
                                SERP.
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
                    {
                        key: 'rank',
                        label: 'Thứ hạng',
                        render: (r) => (r.rank ? '#' + r.rank : 'Chờ dữ liệu')
                    },
                    { key: 'date', label: 'Ngày kiểm tra' }
                ]}
            />
        </>
    );
}
export function Workflows() {
    const { user } = useWorkspace();
    const canRun = ['admin', 'manager'].includes(user?.role);
    const [state, setState] = useState({ loading: true, messages: [], runs: [], error: '' });
    const [busy, setBusy] = useState('');
    async function load() {
        if (!canRun) return;
        try {
            const result = await authRequest('/api/automation/status');
            setState({ loading: false, ...result, error: '' });
        } catch (error) {
            setState((current) => ({ ...current, loading: false, error: error.message }));
        }
    }
    useEffect(() => {
        load();
    }, [canRun]);
    async function run(kind) {
        setBusy(kind);
        setState((current) => ({ ...current, error: '' }));
        try {
            await authRequest(`/api/automation/rpa/${kind}`, { method: 'POST' });
            await load();
        } catch (error) {
            setState((current) => ({ ...current, error: error.message }));
        } finally {
            setBusy('');
        }
    }
    return (
        <>
            <div className="workflow-intro">
                <span className="workflow-emblem">
                    <Workflow size={30} />
                </span>
                <div>
                    <h2>Tự động hóa có chủ đích.</h2>
                    <p>
                        n8n xếp việc đọc bài và gửi email; Playwright mở bảng duyệt và đọc chi tiết
                        trên giao diện.
                    </p>
                </div>
                <span className="badge gray">Cấu hình tích hợp</span>
            </div>
            <Administration kind="data" />
            <div className="workflow-grid">
                <Panel
                    title="Thông báo duyệt bài"
                    subtitle="Gửi tới Admin/Manager sau khi Playwright đọc bài chờ duyệt trên giao diện."
                >
                    <p className="workflow-description">
                        Email được xếp hàng trong PostgreSQL. n8n tạo tác vụ RPA và chỉ gửi sau khi
                        worker đọc xong phiên bản còn chờ duyệt. Duyệt hoặc từ chối vẫn do người
                        quản lý thực hiện trên WebApp.
                    </p>
                    <Button onClick={() => (location.hash = 'posts/approvals')}>
                        Mở bài chờ duyệt
                    </Button>
                    {canRun && (
                        <div className="automation-list">
                            <strong>Thông báo gần đây</strong>
                            {state.messages.length ? (
                                state.messages.slice(0, 6).map((message) => (
                                    <div key={message.id} className="automation-row">
                                        <span>{message.plan_name || 'Bài viết'}</span>
                                        <small>{message.recipient_email}</small>
                                        <Badge
                                            value={
                                                {
                                                    queued: 'Chờ gửi',
                                                    sending: 'Đang gửi / cần kiểm tra',
                                                    sent: 'Đã gửi',
                                                    cancelled: 'Đã hủy'
                                                }[message.status]
                                            }
                                        />
                                    </div>
                                ))
                            ) : (
                                <p>Chưa có thông báo nào.</p>
                            )}
                        </div>
                    )}
                </Panel>
                <Panel
                    title="Playwright · tác vụ trên UI"
                    subtitle="Đọc bài chờ duyệt, chụp Dashboard và xuất CSV trên giao diện."
                >
                    <p className="workflow-description">
                        Chạy thử bằng tài khoản đang đăng nhập. Bản chạy theo lịch cần n8n tạo tác
                        vụ và tiến trình RPA trên máy chủ.
                    </p>
                    {canRun ? (
                        <div className="automation-actions">
                            <Button
                                disabled={Boolean(busy)}
                                onClick={() => run('dashboard_screenshot')}
                            >
                                {busy === 'dashboard_screenshot' ? 'Đang chụp…' : 'Chụp Dashboard'}
                            </Button>
                            <Button
                                aria-label="Xuất CSV bằng Playwright"
                                disabled={Boolean(busy)}
                                onClick={() => run('weekly_csv')}
                            >
                                {busy === 'weekly_csv' ? 'Đang xuất…' : 'Xuất CSV'}
                            </Button>
                        </div>
                    ) : (
                        <p>Admin/Manager có quyền chạy RPA.</p>
                    )}
                    {state.error && (
                        <p role="alert" className="form-error">
                            {state.error}
                        </p>
                    )}
                    {canRun && (
                        <div className="automation-list">
                            <strong>Lần chạy gần đây</strong>
                            {state.runs.length ? (
                                state.runs.slice(0, 6).map((run) => (
                                    <div key={run.id} className="automation-row">
                                        <span>
                                            {run.kind === 'dashboard_screenshot'
                                                ? 'Chụp Dashboard'
                                                : run.kind === 'approval_read'
                                                  ? 'Đọc bài chờ duyệt'
                                                  : 'Xuất CSV'}
                                        </span>
                                        {run.plan_id && (
                                            <a href={`#posts/approvals/${run.plan_id}`}>
                                                {run.plan_id.slice(0, 8)} · v{run.plan_version}
                                            </a>
                                        )}
                                        <Badge
                                            value={
                                                {
                                                    queued: 'Chờ chạy',
                                                    running: 'Đang chạy',
                                                    success: 'Hoàn tất',
                                                    failed: 'Lỗi'
                                                }[run.status]
                                            }
                                        />
                                        {run.status === 'success' &&
                                            run.artifact_name?.split(',').map((name) => (
                                                <a
                                                    key={name}
                                                    href={`/api/automation/artifacts/${run.id}/${name}`}
                                                >
                                                    {name}
                                                </a>
                                            ))}
                                        {run.error && <small>{run.error}</small>}
                                    </div>
                                ))
                            ) : (
                                <p>Chưa chạy tác vụ nào.</p>
                            )}
                        </div>
                    )}
                </Panel>
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
                        Ba workflow mới xếp hàng email duyệt bài, chụp Dashboard và xuất CSV. Cần
                        cấu hình PostgreSQL/SMTP rồi chủ động bật lịch trong n8n.
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
                RPA chỉ đọc và xuất dữ liệu. Bài chờ duyệt không tự được duyệt; worker đăng bài
                Facebook là tiến trình riêng và chỉ chạy khi được bật.
            </div>
        </>
    );
}

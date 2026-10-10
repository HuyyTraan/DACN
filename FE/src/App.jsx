import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
    Activity,
    ArrowUpRight,
    BarChart3,
    Bell,
    CalendarDays,
    ChevronDown,
    CircleHelp,
    ExternalLink,
    FileText,
    Globe2,
    LayoutDashboard,
    Link2,
    Menu,
    MessageSquare,
    Megaphone,
    Plus,
    Search,
    Settings2,
    ShieldCheck,
    Target,
    Users,
    Wallet,
    Workflow,
    X
} from 'lucide-react';
import { Avatar, Badge, Button, Empty, Modal, Platform, dateLabel, money } from './components.jsx';
import {
    Analytics,
    Calendar,
    Dashboard,
    EntityPage,
    InboxPage,
    RankCheck,
    Workflows
} from './pages.jsx';
import Composer from './Composer.jsx';

export const Workspace = createContext(null);
export const useWorkspace = () => useContext(Workspace);
export const navigation = [
    {
        id: 'dashboard',
        label: 'Tổng quan',
        icon: LayoutDashboard,
        group: 'KHÔNG GIAN LÀM VIỆC',
        description: 'Mọi kênh. Một góc nhìn.'
    },
    {
        id: 'calendar',
        label: 'Lịch nội dung',
        icon: CalendarDays,
        description: 'Lên kế hoạch cho những câu chuyện tiếp theo.'
    },
    {
        id: 'chat',
        label: 'Hộp thư đa kênh',
        icon: MessageSquare,
        description: 'Mỗi cuộc trò chuyện, một kết nối mới.'
    },
    {
        id: 'campaigns',
        label: 'Quản lý chiến dịch',
        icon: Megaphone,
        group: 'QUẢN TRỊ ĐA KÊNH',
        description: 'Theo dõi tiến độ và hiệu quả từng chiến dịch.'
    },
    {
        id: 'posts',
        label: 'Quản lý bài viết',
        icon: FileText,
        description: 'Từ ý tưởng đến nội dung được yêu thích.'
    },
    {
        id: 'ads',
        label: 'Quản lý quảng cáo',
        icon: Target,
        description: 'Đưa ngân sách đến đúng đối tượng.'
    },
    {
        id: 'channels',
        label: 'Quản lý kênh',
        icon: Globe2,
        description: 'Kết nối và quản lý sự hiện diện của thương hiệu.'
    },
    {
        id: 'accounts',
        label: 'Cài đặt tài khoản',
        icon: Users,
        description: 'Quản lý tài khoản và người phụ trách các kênh.'
    },
    {
        id: 'performance',
        label: 'Hiệu suất & ngân sách',
        icon: Wallet,
        group: 'PHÂN TÍCH & BÁO CÁO',
        description: 'Hiểu hiệu quả. Chủ động ngân sách.'
    },
    {
        id: 'traffic',
        label: 'Thống kê traffic kênh',
        icon: Activity,
        description: 'Theo dõi hành trình từ tiếp cận đến chuyển đổi.'
    },
    {
        id: 'customers',
        label: 'Traffic khách hàng',
        icon: Users,
        description: 'Hiểu khách hàng qua từng điểm chạm.'
    },
    {
        id: 'postInsights',
        label: 'Thông tin kênh bài viết',
        icon: BarChart3,
        description: 'Nhìn lại nội dung tạo nên kết nối.'
    },
    {
        id: 'rankings',
        label: 'Thứ hạng từ khóa Omni',
        icon: ArrowUpRight,
        group: 'SEO INTELLIGENCE',
        description: 'Theo dõi khả năng hiển thị trên tìm kiếm.'
    },
    {
        id: 'competitors',
        label: 'gCompare · Đối thủ',
        icon: Target,
        description: 'Đặt thương hiệu trong bức tranh thị trường.'
    },
    {
        id: 'rankCheck',
        label: 'gCheck · Kiểm tra thứ hạng',
        icon: Search,
        description: 'Khám phá vị trí của từ khóa mục tiêu.'
    },
    {
        id: 'workflows',
        label: 'Workflow & RPA',
        icon: Workflow,
        group: 'TỰ ĐỘNG HÓA',
        description: 'Kết nối quy trình, dành thời gian cho sáng tạo.'
    }
];
const schema = {
    accounts: [
        ['name', 'Tên tài khoản'],
        ['email', 'Email', 'email'],
        ['platform', 'Nền tảng', window.Omni.platforms],
        ['owner', 'Người phụ trách'],
        ['status', 'Trạng thái', ['Hoạt động', 'Cần kết nối lại']]
    ],
    channels: [
        ['name', 'Tên kênh'],
        ['platform', 'Nền tảng', window.Omni.platforms],
        ['url', 'Địa chỉ kênh', 'url'],
        ['owner', 'Người phụ trách'],
        ['status', 'Trạng thái demo', ['Đã kết nối', 'Cần kết nối lại']],
        ['followers', 'Người theo dõi', 'number']
    ],
    campaigns: [
        ['name', 'Tên chiến dịch'],
        ['platform', 'Kênh chính', window.Omni.platforms],
        ['owner', 'Người phụ trách'],
        ['start', 'Bắt đầu', 'date'],
        ['end', 'Kết thúc', 'date'],
        ['budget', 'Ngân sách (₫)', 'number'],
        ['status', 'Trạng thái', ['Bản nháp', 'Đang chạy', 'Tạm dừng', 'Hoàn thành']]
    ],
    ads: [
        ['name', 'Tên quảng cáo'],
        ['platform', 'Nền tảng', window.Omni.platforms],
        ['campaign', 'Chiến dịch'],
        ['budget', 'Ngân sách / ngày (₫)', 'number'],
        ['status', 'Trạng thái', ['Bản nháp', 'Đang chạy', 'Tạm dừng']]
    ],
    customers: [
        ['name', 'Họ và tên'],
        ['email', 'Email', 'email'],
        ['platform', 'Nguồn', window.Omni.platforms],
        ['source', 'Chiến dịch'],
        ['lead', 'Phân loại', ['Mới', 'Tiềm năng', 'Đã chuyển đổi']]
    ],
    rankings: [
        ['name', 'Từ khóa'],
        ['url', 'Trang đích'],
        ['platform', 'Công cụ tìm kiếm', ['Google']],
        ['volume', 'Lượt tìm kiếm / tháng (demo)', 'number']
    ],
    competitors: [
        ['name', 'Tên đối thủ'],
        ['url', 'Tên miền'],
        ['platform', 'Công cụ tìm kiếm', ['Google']]
    ]
};
const collectionFor = (id) => ({ rankings: 'keywords' })[id] || id;
export default function App() {
    const [page, setPage] = useState(() => location.hash.slice(1) || 'dashboard');
    const [data, setData] = useState(window.Omni.seed());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [mode, setMode] = useState('demo');
    const [version, setVersion] = useState(0);
    const [saving, setSaving] = useState(false);
    const [modal, setModal] = useState(null);
    const [mobile, setMobile] = useState(false);
    const [toast, setToast] = useState('');
    const [period, setPeriod] = useState('month');
    const [platform, setPlatform] = useState('');
    const searchRef = useRef(null);
    const lock = useRef(false);
    const current = navigation.find((item) => item.id === page) || navigation[0];
    async function load(forceDemo = false) {
        setLoading(true);
        setError('');
        try {
            if (forceDemo) {
                setData(window.Omni.load(localStorage));
                setMode('demo');
            } else {
                const response = await fetch('/api/workspace');
                if (!response.ok)
                    throw new Error(
                        'Không thể tải dữ liệu máy chủ. Kiểm tra kết nối PostgreSQL hoặc thử lại.'
                    );
                const body = await response.json();
                setMode(body.mode);
                setVersion(body.version || 0);
                setData(body.mode === 'postgres' ? body.data : window.Omni.load(localStorage));
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        load();
    }, []);
    useEffect(() => {
        const handler = () => {
            setPage(location.hash.slice(1) || 'dashboard');
            setMobile(false);
        };
        window.addEventListener('hashchange', handler);
        return () => window.removeEventListener('hashchange', handler);
    }, []);
    useEffect(() => {
        document.title = `Omni Studio · ${current.label}`;
    }, [current]);
    useEffect(() => {
        if (!toast) return;
        const id = setTimeout(() => setToast(''), 4000);
        return () => clearTimeout(id);
    }, [toast]);
    useEffect(() => {
        function key(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setModal({ type: 'search' });
            }
            if (e.key === 'Escape') setMobile(false);
        }
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, []);
    function navigate(id) {
        location.hash = id;
        setPage(id);
        setMobile(false);
    }
    async function update(next, message = 'Đã lưu thay đổi') {
        if (lock.current) return false;
        lock.current = true;
        setSaving(true);
        try {
            if (mode === 'postgres') {
                const response = await fetch('/api/workspace', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: next, version })
                });
                const body = await response.json();
                if (!response.ok) throw new Error(body.error || 'Không thể lưu dữ liệu.');
                setVersion(body.version);
            } else window.Omni.save(localStorage, next);
            setData(next);
            setToast(message);
            return true;
        } catch (e) {
            setToast(
                e.message.includes('quota')
                    ? 'Bộ nhớ đầy. Hãy giảm kích thước ảnh đính kèm.'
                    : e.message
            );
            return false;
        } finally {
            lock.current = false;
            setSaving(false);
        }
    }
    function edit(kind, row) {
        setModal({ type: 'entity', kind, row });
    }
    function remove(kind, ids) {
        setModal({ type: 'delete', kind: collectionFor(kind), ids });
    }
    function compose(post) {
        setModal({ type: 'compose', post });
    }
    const context = {
        data,
        mode,
        period,
        platform,
        saving,
        update,
        navigate,
        edit,
        remove,
        compose,
        notify: setToast,
        view: (row) => setModal({ type: 'detail', row })
    };
    return (
        <Workspace.Provider value={context}>
            <a
                className="skip-link"
                href="#main"
                onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('main').focus();
                }}
            >
                Đến nội dung chính
            </a>
            {mobile && (
                <button
                    className="sidebar-scrim"
                    onClick={() => setMobile(false)}
                    aria-label="Đóng menu"
                />
            )}
            <aside className={`sidebar ${mobile ? 'open' : ''}`}>
                <a href="#dashboard" className="brand">
                    <img src="/brand.svg" alt="" />
                    <div>
                        omni<span>STUDIO</span>
                    </div>
                </a>
                <button
                    className="workspace-switch"
                    onClick={() => setModal({ type: 'workspace' })}
                >
                    <span className="workspace-logo">O</span>
                    <span>
                        Omni Workspace<small>Marketing team</small>
                    </span>
                    <ChevronDown size={16} />
                </button>
                <nav aria-label="Điều hướng chính">
                    {navigation.map((item) => (
                        <React.Fragment key={item.id}>
                            {item.group && <p className="nav-group">{item.group}</p>}
                            <a
                                href={`#${item.id}`}
                                className={current.id === item.id ? 'nav-link active' : 'nav-link'}
                                aria-current={current.id === item.id ? 'page' : undefined}
                                title={item.label}
                            >
                                <item.icon size={18} />
                                <span>{item.label}</span>
                                {item.id === 'chat' && (
                                    <span className="nav-count">
                                        {
                                            data.conversations.filter(
                                                (c) => c.status === 'Chưa xử lý'
                                            ).length
                                        }
                                    </span>
                                )}
                                {item.id === 'calendar' && <span className="new-dot" />}
                            </a>
                        </React.Fragment>
                    ))}
                </nav>
                <div className="sidebar-bottom">
                    <button className="nav-link" onClick={() => setModal({ type: 'settings' })}>
                        <Settings2 size={18} />
                        Cài đặt không gian
                    </button>
                    <button className="nav-link" onClick={() => setModal({ type: 'help' })}>
                        <CircleHelp size={18} />
                        Trợ giúp & tài liệu
                    </button>
                    <div className="sidebar-profile">
                        <Avatar name="Linh Nguyễn" />
                        <span>
                            <strong>Linh Nguyễn</strong>
                            <small>Quản trị viên · Demo</small>
                        </span>
                        <span className="online-dot" />
                    </div>
                </div>
            </aside>
            <div className="app-body">
                <header className="topbar">
                    <div className="breadcrumb">
                        <button
                            className="icon-button mobile-menu"
                            onClick={() => setMobile(!mobile)}
                            aria-label="Mở menu"
                            aria-expanded={mobile}
                        >
                            <Menu size={20} />
                        </button>
                        <span>Không gian làm việc</span>
                        <span className="slash">/</span>
                        <strong>{current.label}</strong>
                    </div>
                    <div className="topbar-actions">
                        <button
                            className="quick-search"
                            aria-label="Tìm kiếm nhanh"
                            onClick={() => setModal({ type: 'search' })}
                        >
                            <Search size={16} />
                            <span>Tìm kiếm nhanh</span>
                            <kbd>⌘ K</kbd>
                        </button>
                        <span className="header-divider" />
                        <button
                            className="icon-button notification"
                            onClick={() => setModal({ type: 'notifications' })}
                            aria-label="Thông báo"
                        >
                            <Bell size={19} />
                            <i />
                        </button>
                        <Avatar name="Linh Nguyễn" size="small" />
                    </div>
                </header>
                <main id="main" tabIndex="-1">
                    <div className="page-head">
                        <div>
                            <div className="eyebrow">OMNICHANNEL MARKETING</div>
                            <h1>
                                {current.label}
                                {current.id === 'dashboard' && (
                                    <span className="greeting-dot">.</span>
                                )}
                            </h1>
                            <p>{current.description}</p>
                        </div>
                        <div className="page-actions">
                            {[
                                'dashboard',
                                'performance',
                                'traffic',
                                'postInsights',
                                'competitors'
                            ].includes(current.id) && (
                                <label className="date-select">
                                    <CalendarDays size={16} />
                                    <select
                                        aria-label="Khoảng thời gian báo cáo"
                                        value={period}
                                        onChange={(e) => setPeriod(e.target.value)}
                                    >
                                        <option value="month">01 – 31 Th10, 2026</option>
                                        <option value="week">04 – 10 Th10, 2026</option>
                                    </select>
                                </label>
                            )}
                            {['dashboard', 'posts', 'calendar'].includes(current.id) && (
                                <Button icon={Plus} kind="primary" onClick={() => compose()}>
                                    Tạo bài viết
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="mode-line">
                        <span className="online-dot" />
                        <span>
                            {mode === 'postgres'
                                ? 'PostgreSQL · Dữ liệu đã lưu trên máy chủ'
                                : 'Không gian demo · Dữ liệu minh họa, lưu trên trình duyệt'}
                        </span>
                        <span className="mode-tail">UTC+7 · Asia/Ho_Chi_Minh</span>
                    </div>
                    {error ? (
                        <div className="error-panel" role="alert">
                            <ShieldCheck size={28} />
                            <h2>Chưa thể tải không gian làm việc</h2>
                            <p>{error}</p>
                            <div>
                                <Button onClick={() => load()}>Thử lại</Button>
                                <Button onClick={() => load(true)}>Mở bản demo local</Button>
                                <Button kind="danger" onClick={() => setModal({ type: 'reset' })}>
                                    Khôi phục dữ liệu demo
                                </Button>
                            </div>
                        </div>
                    ) : loading ? (
                        <div className="skeleton-grid" role="status" aria-label="Đang tải dữ liệu">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} />
                            ))}
                            <span className="sr-only">Đang tải dữ liệu…</span>
                        </div>
                    ) : !navigation.some((n) => n.id === page) ? (
                        <Empty
                            title="Không tìm thấy màn hình"
                            action={
                                <Button onClick={() => navigate('dashboard')}>Về tổng quan</Button>
                            }
                        />
                    ) : current.id === 'dashboard' ? (
                        <Dashboard />
                    ) : current.id === 'calendar' ? (
                        <Calendar />
                    ) : current.id === 'chat' ? (
                        <InboxPage />
                    ) : current.id === 'rankCheck' ? (
                        <RankCheck />
                    ) : current.id === 'workflows' ? (
                        <Workflows />
                    ) : ['performance', 'traffic', 'postInsights', 'competitors'].includes(
                          current.id
                      ) ? (
                        <Analytics kind={current.id} />
                    ) : (
                        <EntityPage key={current.id} kind={current.id} />
                    )}
                    <footer className="page-footer">
                        <span>© 2026 Omni Studio</span>
                        <span>
                            Designed for meaningful connections <span>✦</span>
                        </span>
                    </footer>
                </main>
            </div>
            {toast && (
                <div className="toast" role="status">
                    {toast}
                </div>
            )}
            {modal?.type === 'compose' && (
                <Composer post={modal.post} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'entity' && (
                <EntityEditor kind={modal.kind} row={modal.row} onClose={() => setModal(null)} />
            )}
            {modal && !['compose', 'entity'].includes(modal.type) && (
                <Modal
                    title={
                        {
                            search: 'Tìm kiếm trong không gian',
                            delete: 'Xóa các mục đã chọn?',
                            reset: 'Khôi phục dữ liệu demo?',
                            detail: 'Thông tin chi tiết',
                            settings: 'Cài đặt không gian',
                            help: 'Trung tâm trợ giúp',
                            workspace: 'Không gian của bạn',
                            notifications: 'Thông báo'
                        }[modal.type]
                    }
                    onClose={() => setModal(null)}
                >
                    {modal.type === 'search' ? (
                        <QuickSearch close={() => setModal(null)} />
                    ) : modal.type === 'delete' ? (
                        <div className="dialog-body">
                            <p>
                                {modal.ids.length} mục sẽ bị xóa khỏi dữ liệu quản trị. Thao tác này
                                không xóa dữ liệu trên nền tảng mạng xã hội.
                            </p>
                            <div className="dialog-footer">
                                <Button onClick={() => setModal(null)}>Hủy</Button>
                                <Button
                                    kind="danger"
                                    disabled={saving}
                                    onClick={async () => {
                                        if (
                                            await update(
                                                {
                                                    ...data,
                                                    [modal.kind]: data[modal.kind].filter(
                                                        (r) => !modal.ids.includes(r.id)
                                                    )
                                                },
                                                'Đã xóa mục đã chọn'
                                            )
                                        )
                                            setModal(null);
                                    }}
                                >
                                    {saving ? 'Đang xóa…' : 'Xác nhận xóa'}
                                </Button>
                            </div>
                        </div>
                    ) : modal.type === 'reset' ? (
                        <div className="dialog-body">
                            <p>
                                Thay thế dữ liệu trong không gian hiện tại bằng bộ dữ liệu demo ban
                                đầu? Các thay đổi quản trị của bạn sẽ bị mất.
                            </p>
                            <Button
                                kind="danger"
                                disabled={saving}
                                onClick={async () => {
                                    if (error) {
                                        try {
                                            window.Omni.save(localStorage, window.Omni.seed());
                                            setModal(null);
                                            load(true);
                                        } catch {
                                            setToast('Không thể ghi vào bộ nhớ trình duyệt.');
                                        }
                                    } else if (
                                        await update(
                                            window.Omni.seed(),
                                            'Đã khôi phục dữ liệu demo'
                                        )
                                    )
                                        setModal(null);
                                }}
                            >
                                Khôi phục
                            </Button>
                        </div>
                    ) : modal.type === 'detail' ? (
                        <div className="dialog-body detail-list">
                            {Object.entries(modal.row)
                                .filter(([key, value]) => !Array.isArray(value) && key !== 'image')
                                .map(([key, value]) => (
                                    <div key={key}>
                                        <span>
                                            {{
                                                id: 'Mã',
                                                name: 'Tên',
                                                platform: 'Nền tảng',
                                                status: 'Trạng thái',
                                                owner: 'Người phụ trách',
                                                budget: 'Ngân sách',
                                                spent: 'Đã chi',
                                                reach: 'Tiếp cận',
                                                leads: 'Khách tiềm năng',
                                                start: 'Bắt đầu',
                                                end: 'Kết thúc',
                                                url: 'Địa chỉ',
                                                rank: 'Thứ hạng',
                                                previous: 'Kỳ trước',
                                                volume: 'Lượt tìm kiếm',
                                                content: 'Nội dung',
                                                date: 'Ngày',
                                                time: 'Giờ',
                                                engagement: 'Tương tác',
                                                email: 'Email',
                                                visits: 'Lượt truy cập',
                                                lead: 'Phân loại',
                                                source: 'Nguồn',
                                                last: 'Truy cập gần nhất',
                                                clicks: 'Lượt nhấp',
                                                ctr: 'CTR',
                                                campaign: 'Chiến dịch',
                                                traffic: 'Traffic',
                                                keywords: 'Từ khóa',
                                                score: 'Điểm hiển thị'
                                            }[key] || key}
                                        </span>
                                        <strong>{String(value)}</strong>
                                    </div>
                                ))}
                        </div>
                    ) : modal.type === 'notifications' ? (
                        <div className="dialog-body">
                            <div className="notice-item">
                                <Link2 />
                                <div>
                                    <strong>YouTube cần kết nối lại</strong>
                                    <p>Kiểm tra tài khoản Hoàng Nam trong danh sách kênh (demo).</p>
                                    <Button
                                        onClick={() => {
                                            navigate('channels');
                                            setModal(null);
                                        }}
                                    >
                                        Xem kênh
                                    </Button>
                                </div>
                            </div>
                            <div className="notice-item">
                                <MessageSquare />
                                <div>
                                    <strong>
                                        {
                                            data.conversations.filter(
                                                (c) => c.status === 'Chưa xử lý'
                                            ).length
                                        }{' '}
                                        hội thoại đang chờ
                                    </strong>
                                    <p>Dành một chút thời gian cho khách hàng của bạn.</p>
                                    <Button
                                        onClick={() => {
                                            navigate('chat');
                                            setModal(null);
                                        }}
                                    >
                                        Mở hộp thư
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : modal.type === 'settings' ? (
                        <div className="dialog-body">
                            <div className="settings-row">
                                <span>Nguồn lưu dữ liệu</span>
                                <Badge value={mode === 'postgres' ? 'PostgreSQL' : 'Demo local'} />
                            </div>
                            <div className="settings-row">
                                <span>Múi giờ</span>
                                <strong>Asia/Ho_Chi_Minh (UTC+7)</strong>
                            </div>
                            <p className="hint">
                                Các chỉ số báo cáo và kết nối kênh hiện là dữ liệu minh họa.
                                PostgreSQL lưu dữ liệu quản trị; chưa có đồng bộ chỉ số từ nhà cung
                                cấp.
                            </p>
                            <Button kind="danger" onClick={() => setModal({ type: 'reset' })}>
                                Khôi phục dữ liệu demo
                            </Button>
                        </div>
                    ) : modal.type === 'workspace' ? (
                        <div className="dialog-body">
                            <div className="workspace-card">
                                <span className="workspace-logo">O</span>
                                <div>
                                    <strong>Omni Workspace</strong>
                                    <p>
                                        Marketing team ·{' '}
                                        {mode === 'postgres' ? 'PostgreSQL' : 'Demo'}
                                    </p>
                                </div>
                                <ShieldCheck color="#6f5ec5" />
                            </div>
                            <p className="hint">
                                Một không gian prototype. Phân quyền và đa tenant chưa được tích
                                hợp.
                            </p>
                        </div>
                    ) : (
                        <div className="dialog-body">
                            <p>
                                Quản lý chiến dịch, nội dung và hiệu suất trong một không gian
                                chung.
                            </p>
                            <a
                                className="doc-link"
                                href="/api/docs"
                                target="_blank"
                                rel="noreferrer"
                            >
                                <FileText size={18} />
                                Swagger · Tài liệu API
                                <ExternalLink size={15} />
                            </a>
                            <a
                                className="doc-link"
                                href="/api/postman"
                                download="omni-studio.postman_collection.json"
                            >
                                <FileText size={18} />
                                Tải collection Postman
                            </a>
                            <p className="hint">
                                Kết nối nền tảng, hội thoại và thứ hạng là demo. Bài lên lịch chỉ
                                được lưu; chưa có worker tự đăng. Nút đăng Facebook thật trong trình
                                soạn bài sử dụng API hiện có và cần cấu hình token trên máy chủ.
                            </p>
                        </div>
                    )}
                </Modal>
            )}
        </Workspace.Provider>
    );
}
function QuickSearch({ close }) {
    const { navigate, data, compose, view } = useWorkspace();
    const [query, setQuery] = useState('');
    const pages = navigation.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()));
    const posts = query
        ? data.posts.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        : [];
    return (
        <div className="dialog-body">
            <label className="search-field large">
                <Search size={18} />
                <input
                    autoFocus
                    placeholder="Tìm màn hình, bài viết…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </label>
            <div className="search-results">
                {pages.map((n) => (
                    <button
                        key={n.id}
                        onClick={() => {
                            navigate(n.id);
                            close();
                        }}
                    >
                        <n.icon size={18} />
                        <span>{n.label}</span>
                        <ArrowUpRight size={16} />
                    </button>
                ))}
                {posts.map((p) => (
                    <button
                        key={p.id}
                        onClick={() => {
                            close();
                            setTimeout(() => compose(p), 0);
                        }}
                    >
                        <FileText size={18} />
                        <span>{p.name}</span>
                    </button>
                ))}
                {!pages.length && !posts.length && (
                    <Empty
                        title="Không tìm thấy kết quả"
                        description="Thử tìm theo tên màn hình hoặc bài viết."
                    />
                )}
            </div>
        </div>
    );
}
function EntityEditor({ kind, row, onClose }) {
    const { data, update, saving } = useWorkspace();
    const [form, setForm] = useState(() => ({
        name: '',
        platform: 'Facebook',
        status: 'Bản nháp',
        owner: 'Linh Nguyễn',
        email: '',
        url: '',
        budget: 0,
        followers: 0,
        start: window.Omni.today,
        end: '2026-10-31',
        rank: 0,
        previous: 0,
        volume: 0,
        reach: 0,
        spent: 0,
        leads: 0,
        clicks: 0,
        ctr: 0,
        visits: 0,
        lead: 'Mới',
        last: window.Omni.today,
        traffic: 0,
        keywords: 0,
        score: 0,
        ...Object.fromEntries(
            schema[kind].filter((f) => Array.isArray(f[2])).map((f) => [f[0], f[2][0]])
        ),
        ...row
    }));
    const [error, setError] = useState('');
    async function submit(e) {
        e.preventDefault();
        setError('');
        if (!form.name.trim()) {
            setError('Vui lòng nhập tên.');
            return;
        }
        if (kind === 'campaigns' && form.end < form.start) {
            setError('Ngày kết thúc phải sau ngày bắt đầu.');
            return;
        }
        const collection = collectionFor(kind);
        const record = {
            ...form,
            name: form.name.trim(),
            id: row?.id || crypto.randomUUID(),
            created: row?.created || window.Omni.today
        };
        const next = {
            ...data,
            [collection]: row
                ? data[collection].map((r) => (r.id === row.id ? record : r))
                : [...data[collection], record]
        };
        if (await update(next, row ? 'Đã lưu thay đổi' : 'Đã thêm mục mới')) onClose();
        else setError('Không thể lưu. Kiểm tra kết nối hoặc dung lượng bộ nhớ và thử lại.');
    }
    return (
        <Modal
            title={`${row ? 'Chỉnh sửa' : 'Thêm'} ${{ accounts: 'tài khoản', channels: 'kênh', campaigns: 'chiến dịch', ads: 'quảng cáo', customers: 'khách hàng', rankings: 'từ khóa', competitors: 'đối thủ' }[kind]}`}
            onClose={onClose}
        >
            <form onSubmit={submit} className="dialog-body">
                <div className="form-grid">
                    {schema[kind].map(([key, label, type]) => (
                        <label key={key}>
                            {label}
                            {Array.isArray(type) ? (
                                <select
                                    value={form[key]}
                                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                >
                                    {type.map((option) => (
                                        <option key={option}>{option}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    required={!['url', 'email', 'source', 'campaign'].includes(key)}
                                    type={type || 'text'}
                                    min={type === 'number' ? '0' : undefined}
                                    maxLength={type ? undefined : 180}
                                    value={form[key] ?? ''}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            [key]:
                                                type === 'number'
                                                    ? Number(e.target.value)
                                                    : e.target.value
                                        })
                                    }
                                />
                            )}
                        </label>
                    ))}
                </div>
                {['accounts', 'channels', 'competitors', 'rankings', 'ads'].includes(kind) && (
                    <p className="hint">
                        Thao tác lưu dữ liệu quản trị, không kết nối hay thay đổi dữ liệu trên nền
                        tảng thật.
                    </p>
                )}
                {error && (
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="dialog-footer">
                    <Button type="button" onClick={onClose}>
                        Hủy
                    </Button>
                    <Button kind="primary" type="submit" disabled={saving}>
                        {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

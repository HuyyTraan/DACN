import React, { useEffect, useState } from 'react';
import {
    ArrowRight,
    BarChart3,
    CalendarDays,
    CheckCircle2,
    Clock3,
    FileText,
    Link2,
    Megaphone,
    MessageSquare,
    RefreshCw,
    Search,
    Target,
    Users,
    Wallet,
    Workflow
} from 'lucide-react';
import { useWorkspace } from './App.jsx';
import { authRequest } from './Auth.jsx';
import { money, number } from './components.jsx';

const dateTime = (value) =>
    value
        ? new Date(value).toLocaleString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
              dateStyle: 'short',
              timeStyle: 'short',
              hour12: false
          })
        : '—';

function SummaryCard({ icon: Icon, label, value, detail, onClick, tone }) {
    return (
        <button type="button" className={`overview-stat overview-${tone}`} onClick={onClick}>
            <span className="overview-stat-icon">
                <Icon size={20} aria-hidden="true" />
            </span>
            <span className="overview-stat-label">{label}</span>
            <strong>{value}</strong>
            <span className="overview-stat-detail">
                {detail} <ArrowRight size={14} aria-hidden="true" />
            </span>
        </button>
    );
}

function Section({ title, caption, action, children }) {
    return (
        <section className="overview-section">
            <div className="overview-section-head">
                <div>
                    <h3>{title}</h3>
                    <p>{caption}</p>
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

export default function Dashboard() {
    const {
        data,
        mode,
        period,
        version,
        social,
        socialLoading,
        socialError,
        user,
        navigate,
        openPostsTab
    } = useWorkspace();
    const [refreshKey, setRefreshKey] = useState(0);
    const [state, setState] = useState({ loading: mode === 'postgres', value: null, error: '' });
    useEffect(() => {
        if (mode !== 'postgres') {
            setState({ loading: false, value: null, error: '' });
            return;
        }
        let live = true;
        async function refresh() {
            try {
                const value = await authRequest(`/api/dashboard?period=${period}`);
                if (live) setState({ loading: false, value, error: '' });
            } catch (error) {
                if (live) setState({ loading: false, value: null, error: error.message });
            }
        }
        setState((current) => ({ ...current, loading: true }));
        refresh();
        const timer = setInterval(refresh, 30000);
        window.addEventListener('publishing-plans-changed', refresh);
        return () => {
            live = false;
            clearInterval(timer);
            window.removeEventListener('publishing-plans-changed', refresh);
        };
    }, [mode, period, version, refreshKey]);

    const summary = mode === 'postgres' ? state.value : null;
    const publishing = summary?.publishing;
    const metrics = summary?.metrics;
    const connected = social.accounts.filter((account) => account.status === 'connected');
    const canReview = ['admin', 'manager'].includes(user.role);
    const counts =
        summary?.counts ||
        Object.fromEntries(
            Object.entries(data).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 0])
        );
    const modules = [
        { label: 'Chiến dịch', value: counts.campaigns || 0, icon: Megaphone, target: 'campaigns' },
        { label: 'Quảng cáo', value: counts.ads || 0, icon: Target, target: 'ads' },
        { label: 'Khách hàng', value: counts.customers || 0, icon: Users, target: 'customers' },
        {
            label: 'Hội thoại lưu trong workspace',
            value: counts.conversations || 0,
            icon: MessageSquare,
            target: 'chat'
        },
        { label: 'Từ khóa', value: counts.keywords || 0, icon: Search, target: 'rankings' },
        { label: 'Workflow & RPA', value: null, icon: Workflow, target: 'workflows' },
        { label: 'Bài trên nền tảng', value: null, icon: FileText, tab: 'page' },
        { label: 'Phân tích AI', value: null, icon: BarChart3, target: 'aiAnalysis' }
    ];

    return (
        <div className="overview">
            <div className="overview-intro">
                <div>
                    <span className="overview-kicker">BẢNG ĐIỀU HÀNH · {user.name}</span>
                    <h2>Việc cần chú ý trước khi lên sóng</h2>
                    <p>
                        Theo dõi bài chờ duyệt, lịch đăng và kết quả được lưu trong Omni Studio từ
                        cùng một nơi.
                    </p>
                </div>
                <button
                    type="button"
                    className="overview-refresh"
                    onClick={() => setRefreshKey((key) => key + 1)}
                    disabled={mode !== 'postgres' || state.loading}
                >
                    <RefreshCw size={16} aria-hidden="true" /> Làm mới
                </button>
            </div>

            {mode !== 'postgres' ? (
                <p className="overview-message" role="status">
                    Bạn đang dùng dữ liệu cục bộ. Kết nối PostgreSQL để xem hàng duyệt, lượt đăng và
                    số liệu được ghi nhận trên máy chủ.
                </p>
            ) : state.error ? (
                <p className="overview-message overview-error" role="alert">
                    Chưa tải được số liệu tổng quan: {state.error}
                </p>
            ) : state.loading && !summary ? (
                <p className="overview-message" role="status">
                    Đang tổng hợp dữ liệu…
                </p>
            ) : null}

            <div className="overview-stats">
                <SummaryCard
                    icon={Clock3}
                    label="Bài chờ duyệt"
                    value={publishing ? number(publishing.pending) : '—'}
                    detail={canReview ? 'Mở bảng duyệt' : 'Xem bài đã gửi'}
                    tone="amber"
                    onClick={() => openPostsTab('approvals')}
                />
                <SummaryCard
                    icon={CalendarDays}
                    label="Lượt đăng 7 ngày tới"
                    value={publishing ? number(publishing.upcoming) : '—'}
                    detail="Xem lịch nội dung"
                    tone="purple"
                    onClick={() => navigate('calendar')}
                />
                <SummaryCard
                    icon={CheckCircle2}
                    label={`Lượt đã đăng · ${period === 'week' ? '7' : '30'} ngày`}
                    value={publishing ? number(publishing.published) : '—'}
                    detail="Xem bài viết"
                    tone="mint"
                    onClick={() => openPostsTab('approvals')}
                />
                <SummaryCard
                    icon={Link2}
                    label="Tài khoản đã kết nối"
                    value={socialLoading || socialError ? '—' : number(connected.length)}
                    detail="Quản lý kết nối"
                    tone="blue"
                    onClick={() => navigate('connections')}
                />
            </div>
            {socialError && (
                <p className="overview-source-error" role="alert">
                    Không tải được trạng thái kết nối: {socialError}
                </p>
            )}

            <div className="overview-work-grid">
                <Section
                    title="Chờ quyết định"
                    caption="Kế hoạch đang chờ duyệt trên máy chủ"
                    action={
                        <button
                            className="overview-inline-link"
                            onClick={() => openPostsTab('approvals')}
                        >
                            Xem tất cả <ArrowRight size={15} />
                        </button>
                    }
                >
                    {publishing?.pendingItems.length ? (
                        <div className="overview-list">
                            {publishing.pendingItems.map((item) => (
                                <button
                                    key={item.id}
                                    className="overview-row"
                                    onClick={() => openPostsTab('approvals')}
                                >
                                    <span className="overview-row-mark overview-amber">
                                        <FileText size={17} />
                                    </span>
                                    <span className="overview-row-main">
                                        <strong>{item.name}</strong>
                                        <small>Dự kiến {dateTime(item.scheduled_at)}</small>
                                    </span>
                                    <ArrowRight size={16} />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="overview-empty">
                            {publishing ? 'Không có bài chờ duyệt.' : 'Chưa có dữ liệu hàng duyệt.'}
                        </p>
                    )}
                </Section>
                <Section
                    title="Sắp lên lịch"
                    caption="Từng lượt chờ đăng trong 7 ngày tới · không gồm bản nháp"
                    action={
                        <button
                            className="overview-inline-link"
                            onClick={() => navigate('calendar')}
                        >
                            Mở lịch <ArrowRight size={15} />
                        </button>
                    }
                >
                    {publishing?.upcomingItems.length ? (
                        <div className="overview-list">
                            {publishing.upcomingItems.map((item) => (
                                <button
                                    key={item.id}
                                    className="overview-row"
                                    onClick={() => navigate('calendar')}
                                >
                                    <span className="overview-row-mark overview-purple">
                                        <CalendarDays size={17} />
                                    </span>
                                    <span className="overview-row-main">
                                        <strong>{item.name}</strong>
                                        <small>
                                            {dateTime(item.due_at)} ·{' '}
                                            {connected.find(
                                                (account) => account.id === item.account_id
                                            )?.name || item.account_id}
                                        </small>
                                    </span>
                                    <ArrowRight size={16} />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="overview-empty">
                            {publishing
                                ? 'Không có lượt đăng trong 7 ngày tới.'
                                : 'Chưa có dữ liệu lịch đăng.'}
                        </p>
                    )}
                </Section>
            </div>

            <div className="overview-work-grid overview-secondary">
                <Section
                    title="Dữ liệu và tính năng"
                    caption="Số bản ghi trong workspace và lối tắt đến các màn liên quan"
                >
                    <div className="overview-modules">
                        {modules.map(({ label, value, icon: Icon, target, tab }) => (
                            <button
                                key={target || tab}
                                className="overview-module"
                                onClick={() => (tab ? openPostsTab(tab) : navigate(target))}
                            >
                                <Icon size={18} aria-hidden="true" />
                                <span>{label}</span>
                                <strong>{value === null ? 'Mở' : number(value)}</strong>
                            </button>
                        ))}
                    </div>
                </Section>
                <Section
                    title="Số liệu đã ghi nhận"
                    caption={`${period === 'week' ? '7' : '30'} ngày gần nhất · nhập và lưu trong PostgreSQL`}
                    action={
                        <button
                            className="overview-inline-link"
                            onClick={() => navigate('performance')}
                        >
                            Xem báo cáo <ArrowRight size={15} />
                        </button>
                    }
                >
                    {metrics ? (
                        <div className="overview-records">
                            <div>
                                <BarChart3 size={17} />
                                <span>Lượt tiếp cận</span>
                                <strong>{number(metrics.reach)}</strong>
                            </div>
                            <div>
                                <Target size={17} />
                                <span>Lượt nhấp</span>
                                <strong>{number(metrics.clicks)}</strong>
                            </div>
                            <div>
                                <Wallet size={17} />
                                <span>Chi phí ghi nhận</span>
                                <strong>{money(metrics.spend)}</strong>
                            </div>
                            <small>
                                {number(metrics.records)} bản ghi · chưa tự đồng bộ insight từ
                                Facebook/Instagram
                            </small>
                        </div>
                    ) : (
                        <p className="overview-empty">Chưa tải được số liệu đã ghi nhận.</p>
                    )}
                    {publishing && (publishing.attention > 0 || publishing.rejected > 0) && (
                        <button
                            className="overview-attention"
                            onClick={() => openPostsTab('approvals')}
                        >
                            {publishing.attention} lượt cần kiểm tra · {publishing.rejected} bài bị
                            từ chối
                            <ArrowRight size={15} />
                        </button>
                    )}
                </Section>
            </div>
            <p className="overview-footnote">
                Lượt đã đăng chỉ tính delivery do Omni Studio xử lý. Bài đăng trực tiếp trên Page
                xem tại “Bài trên nền tảng”; không cộng vào số liệu này.
            </p>
        </div>
    );
}

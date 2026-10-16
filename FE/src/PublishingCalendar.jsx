import React, { useEffect, useRef, useState } from 'react';
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Link2,
    Plus,
    Trash2,
    Pencil
} from 'lucide-react';
import { useWorkspace } from './App.jsx';
import { Avatar, Button, Modal, Platform } from './components.jsx';
import { socialRequest } from './Social.jsx';
import {
    zones,
    displayTime,
    fromPlan,
    utcTime,
    publishingStates,
    planStatus,
    workspaceStatus,
    mergePublishedEvents
} from './publishing-model.mjs';
const addDays = (date, count) =>
    new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
export default function PublishingCalendar() {
    const {
        data,
        compose,
        social,
        socialLoading,
        socialError,
        navigate,
        remove,
        saving,
        user,
        socialRevision
    } = useWorkspace();
    const accounts = social.accounts.filter((a) => a.status === 'connected');
    const [date, setDate] = useState(window.Omni.today);
    const [view, setView] = useState('week');
    const [zone, setZone] = useState('Asia/Ho_Chi_Minh');
    const [filter, setFilter] = useState('');
    const [stateFilter, setStateFilter] = useState('Tất cả');
    const [plans, setPlans] = useState([]);
    const [next, setNext] = useState(null);
    const [server, setServer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [cancel, setCancel] = useState(null);
    const [publishNow, setPublishNow] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [platformPosts, setPlatformPosts] = useState([]);
    const [platformCursors, setPlatformCursors] = useState({});
    const [platformLoading, setPlatformLoading] = useState(false);
    const [platformError, setPlatformError] = useState('');
    const [platformRefresh, setPlatformRefresh] = useState(0);
    const [publishedPreview, setPublishedPreview] = useState(null);
    const platformRequest = useRef(0);
    const scroll = useRef(null);
    const mounted = useRef(true);
    async function reload() {
        setLoading(true);
        setError('');
        try {
            const status = await socialRequest('/api/publishing/status');
            if (!mounted.current) return;
            setServer(status);
            if (status.ready) {
                const body = await socialRequest('/api/publishing/plans');
                if (mounted.current) {
                    setPlans(body.plans);
                    setNext(body.nextOffset);
                }
            } else {
                setError(
                    status.error ||
                        'Chưa truy cập được kho lịch. Lịch đã lưu vẫn được giữ trong PostgreSQL.'
                );
            }
        } catch (e) {
            if (mounted.current) setError(e.message);
        } finally {
            if (mounted.current) setLoading(false);
        }
    }
    useEffect(() => {
        mounted.current = true;
        reload();
        const listener = () => reload();
        window.addEventListener('publishing-plans-changed', listener);
        const timer = setInterval(listener, 30000);
        return () => {
            mounted.current = false;
            window.removeEventListener('publishing-plans-changed', listener);
            clearInterval(timer);
        };
    }, []);
    useEffect(() => {
        const refresh = () => setPlatformRefresh((value) => value + 1);
        window.addEventListener('platform-posts-changed', refresh);
        return () => window.removeEventListener('platform-posts-changed', refresh);
    }, []);
    useEffect(() => {
        if (scroll.current && view !== 'month') {
            const hourHeight =
                scroll.current.querySelector('.planner-hour')?.getBoundingClientRect().height ||
                240;
            scroll.current.scrollTop = 8 * hourHeight;
        }
    }, [view]);
    const monday = addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
    const monthStart = date.slice(0, 7) + '-01';
    const monthDays = new Date(
        Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)
    ).getUTCDate();
    const days =
        view === 'day'
            ? [date]
            : view === 'week'
              ? Array.from({ length: 7 }, (_, i) => addDays(monday, i))
              : Array.from({ length: monthDays }, (_, i) => addDays(monthStart, i));
    const since = Math.floor(Date.parse(utcTime(days[0], '00:00', zone)) / 1000);
    const until = Math.floor(
        Date.parse(utcTime(addDays(days[days.length - 1], 1), '00:00', zone)) / 1000
    );
    const platformAccountIds = accounts
        .filter((a) => a.platform === 'Facebook')
        .map((a) => a.id)
        .sort()
        .join('|');
    const currentPlatformRange = `${platformAccountIds}:${since}:${until}`;
    const platformRange = useRef(currentPlatformRange);
    platformRange.current = currentPlatformRange;
    useEffect(() => {
        const request = ++platformRequest.current;
        setPlatformLoading(true);
        setPlatformError('');
        setPlatformPosts([]);
        setPlatformCursors({});
        const ids = platformAccountIds ? platformAccountIds.split('|') : [];
        Promise.allSettled(
            ids.map(async (id) => ({
                id,
                ...(await socialRequest(
                    `/api/social/accounts/${encodeURIComponent(id)}/posts?since=${since}&until=${until}`
                ))
            }))
        ).then((results) => {
            if (!mounted.current || request !== platformRequest.current) return;
            const received = [],
                cursors = {},
                errors = [];
            results.forEach((r, i) => {
                if (r.status === 'rejected') {
                    errors.push(
                        `${accounts.find((a) => a.id === ids[i])?.name || ids[i]}: ${r.reason.message}`
                    );
                    return;
                }
                const account = accounts.find((a) => a.id === r.value.id);
                received.push(
                    ...r.value.posts.map((p) => ({
                        ...p,
                        accountId: r.value.id,
                        accountName: account?.name,
                        accountAvatar: account?.avatar
                    }))
                );
                cursors[r.value.id] = r.value.nextCursor;
            });
            setPlatformPosts(received);
            setPlatformCursors(cursors);
            setPlatformError(errors.join(' · '));
            setPlatformLoading(false);
        });
        return () => {
            platformRequest.current++;
        };
    }, [platformAccountIds, since, until, socialRevision, platformRefresh]);
    async function loadPlatformMore() {
        const range = currentPlatformRange,
            request = platformRequest.current;
        setPlatformLoading(true);
        setPlatformError('');
        try {
            for (const [id, cursor] of Object.entries(platformCursors).filter(([, c]) => c)) {
                const body = await socialRequest(
                    `/api/social/accounts/${encodeURIComponent(id)}/posts?since=${since}&until=${until}&after=${encodeURIComponent(cursor)}`
                );
                if (
                    !mounted.current ||
                    request !== platformRequest.current ||
                    range !== platformRange.current
                )
                    return;
                const account = accounts.find((a) => a.id === id);
                setPlatformPosts((current) => [
                    ...new Map(
                        [
                            ...current,
                            ...body.posts.map((p) => ({
                                ...p,
                                accountId: id,
                                accountName: account?.name,
                                accountAvatar: account?.avatar
                            }))
                        ].map((p) => [`${p.accountId}:${p.id}`, p])
                    ).values()
                ]);
                setPlatformCursors((current) => ({ ...current, [id]: body.nextCursor }));
            }
        } catch (e) {
            if (range === platformRange.current) setPlatformError(e.message);
        } finally {
            if (range === platformRange.current) setPlatformLoading(false);
        }
    }
    const events = mergePublishedEvents(
        [
            ...data.posts
                .filter((p) => !plans.some((plan) => plan.id === p.serverPlanId))
                .map((p) => ({
                    ...p,
                    calendarId: p.id,
                    status: workspaceStatus(p),
                    ...displayTime(utcTime(p.date, p.time, p.timezone || 'Asia/Ho_Chi_Minh'), zone),
                    source: 'local'
                })),
            ...plans.flatMap((p) =>
                p.deliveries.length
                    ? p.deliveries.map((d) => ({
                          ...fromPlan(p, accounts),
                          name: p.name,
                          content: p.items[d.item_index].content,
                          calendarId: d.id,
                          providerPostId: d.provider_post_id,
                          accountIds: [d.account_id],
                          ...displayTime(d.due_at, zone),
                          status: planStatus(p, d),
                          deliveryStatus: d.status,
                          source: 'server',
                          plan: p
                      }))
                    : [
                          {
                              ...fromPlan(p, accounts),
                              calendarId: p.id,
                              ...displayTime(p.scheduledAt || new Date().toISOString(), zone),
                              source: 'server',
                              status: planStatus(p),
                              plan: p
                          }
                      ]
            )
        ],
        platformPosts.filter(
            (p) =>
                Date.parse(p.createdTime) >= since * 1000 &&
                Date.parse(p.createdTime) < until * 1000
        ),
        zone
    ).filter((e) => !filter || (e.accountIds || [e.accountId]).includes(filter));
    const visibleEvents = events.filter(
        (e) => stateFilter === 'Tất cả' || e.status === stateFilter
    );
    async function approve(event) {
        setBusy(true);
        setError('');
        try {
            await socialRequest(`/api/publishing/plans/${event.plan.id}/approve`, {
                method: 'POST',
                body: JSON.stringify({ version: event.plan.version })
            });
            await reload();
        } catch (e) {
            await reload();
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    function create(day, time) {
        const local = displayTime(utcTime(day, time, zone), 'Asia/Ho_Chi_Minh');
        compose({ ...local, ...(filter ? { accountId: filter, accountIds: [filter] } : {}) });
    }
    function edit(event) {
        if (event.source === 'platform') {
            setPublishedPreview(event);
            return;
        }
        compose(
            event.source === 'server'
                ? {
                      ...fromPlan(event.plan, accounts),
                      ...(event.deliveryStatus
                          ? {
                                serverDeliveryId: event.calendarId,
                                serverDeliveryAccountId: event.accountIds[0],
                                serverDeliveryStatus: event.deliveryStatus
                            }
                          : {}),
                      ...(event.status === 'Đã hủy' && event.plan.status !== 'cancelled'
                          ? { publishingReadOnly: true }
                          : {})
                  }
                : {
                      ...data.posts.find((p) => p.id === event.id),
                      ...(event.status === 'Đã hủy' ? { status: 'Đã hủy' } : {})
                  }
        );
    }
    function shift(amount) {
        if (view === 'month') {
            const d = new Date(`${date}T12:00:00Z`);
            d.setUTCMonth(d.getUTCMonth() + amount, 1);
            setDate(d.toISOString().slice(0, 10));
        } else setDate(addDays(date, amount * (view === 'week' ? 7 : 1)));
    }
    async function cancelPlan() {
        setBusy(true);
        try {
            await socialRequest(`/api/publishing/plans/${cancel.id}/cancel`, {
                method: 'POST',
                body: JSON.stringify({ version: cancel.version })
            });
            setCancel(null);
            await reload();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    async function publishApprovedNow() {
        if (!publishNow) return;
        const event = publishNow;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const result = await socialRequest(
                `/api/publishing/plans/${event.plan.id}/deliveries/${event.calendarId}/publish-now`,
                {
                    method: 'POST',
                    body: JSON.stringify({ version: event.plan.version })
                }
            );
            setPublishNow(null);
            await reload();
            setPlatformRefresh((value) => value + 1);
            setNotice(
                result.status === 'published'
                    ? 'Đã đăng bài lên Facebook Page và lưu kết quả.'
                    : result.status === 'unknown'
                      ? 'Chưa rõ Facebook đã nhận bài hay chưa. Kiểm tra Page trước khi tạo lượt đăng khác.'
                      : `Chưa đăng được: ${result.error || 'Kiểm tra kết nối Page.'}`
            );
        } catch (e) {
            setPublishNow(null);
            await reload();
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    function card(event) {
        const account = accounts.find((a) =>
            (event.accountIds || [event.accountId]).includes(a.id)
        );
        return (
            <article
                className={`planner-event state-${event.deliveryStatus || (event.status === 'Chưa duyệt' ? 'pending' : event.status === 'Đã hủy' ? 'cancelled' : 'local')}`}
                key={event.calendarId}
            >
                <div className="planner-event-head">
                    <Avatar
                        name={account?.name || event.accountName || event.name}
                        src={account?.avatar || event.accountAvatar}
                        size="small"
                    />
                    <strong>{account?.name || event.accountName || event.name}</strong>
                    <details className="planner-event-menu">
                        <summary aria-label={`Thao tác ${event.name}`} title="Thao tác">
                            ···
                        </summary>
                        <div>
                            <button onClick={() => edit(event)}>
                                <Pencil size={13} />
                                {event.source === 'platform' ? 'Xem bài đã đăng' : 'Xem / sửa'}
                            </button>
                            {event.source === 'server' &&
                            event.status !== 'Đã hủy' &&
                            ['admin', 'manager'].includes(user.role) ? (
                                <button onClick={() => setCancel(event.plan)}>
                                    <Trash2 size={13} />
                                    Hủy lượt còn chờ
                                </button>
                            ) : (
                                event.source === 'local' &&
                                !event.facebookPostId &&
                                !event.publishResults?.length && (
                                    <button onClick={() => remove('posts', [event.id])}>
                                        <Trash2 size={13} />
                                        Xóa bản soạn
                                    </button>
                                )
                            )}
                        </div>
                    </details>
                </div>
                <button className="planner-event-content" onClick={() => edit(event)}>
                    {event.content}
                </button>
                <small>
                    <Clock3 size={12} />
                    {event.time}
                </small>
                <span
                    className={`planner-state-tag status-${event.status === 'Đã đăng' ? 'published' : event.status === 'Đã hủy' ? 'cancelled' : event.status === 'Bị từ chối' ? 'rejected' : event.status === 'Chưa duyệt' ? 'pending' : 'approved'}`}
                >
                    {event.status}
                </span>
                {event.status === 'Đã hủy' && (
                    <p className="planner-cancel-reason">
                        {event.plan?.cancellationReason ||
                            event.cancellationReason ||
                            'Đã hủy lịch đăng'}
                    </p>
                )}
                {event.status === 'Bị từ chối' && (
                    <p className="planner-cancel-reason">
                        {event.plan?.rejectionReason || 'Quản lý đã từ chối bài này.'}
                    </p>
                )}
                {event.status === 'Bị từ chối' && user.role !== 'viewer' && (
                    <button className="text-link" onClick={() => edit(event)}>
                        Sửa & gửi lại
                    </button>
                )}
                {event.status === 'Đã hủy' &&
                    user.role !== 'viewer' &&
                    (event.source !== 'server' || event.plan.status === 'cancelled') && (
                        <button className="text-link" onClick={() => edit(event)}>
                            Sửa giờ & gửi lại
                        </button>
                    )}
                {event.status === 'Chưa duyệt' &&
                    event.source === 'server' &&
                    ['admin', 'manager'].includes(user.role) && (
                        <button
                            disabled={busy}
                            className="text-link"
                            onClick={() => approve(event)}
                        >
                            Duyệt & lên lịch
                        </button>
                    )}
                {event.status === 'Đã duyệt chưa đăng' &&
                    event.source === 'server' &&
                    event.deliveryStatus === 'queued' &&
                    event.plan.items[event.item_index]?.kind === 'post' &&
                    event.item_index === 0 &&
                    ['admin', 'manager'].includes(user.role) && (
                        <button
                            disabled={busy}
                            className="text-link planner-publish-now"
                            onClick={() => setPublishNow(event)}
                        >
                            Đăng ngay
                        </button>
                    )}
            </article>
        );
    }
    return (
        <div className="publishing-studio">
            <aside className="planner-channels">
                <div className="planner-sidebar-heading">
                    <strong>Tài khoản & kênh</strong>
                    <span>{accounts.length}</span>
                </div>
                <Button icon={Link2} onClick={() => navigate('connections')}>
                    Liên kết tài khoản
                </Button>
                <Button icon={Plus} kind="primary" onClick={() => compose()}>
                    Tạo bài viết
                </Button>
                <button
                    className={`planner-all ${!filter ? 'active' : ''}`}
                    onClick={() => setFilter('')}
                >
                    Tất cả tài khoản
                </button>
                {socialLoading && <p role="status">Đang kiểm tra tài khoản…</p>}
                {socialError && <p role="alert">{socialError}</p>}
                <details open className="planner-account-group">
                    <summary>Đã kết nối</summary>
                    {accounts.map((a) => (
                        <button
                            key={a.id}
                            className={`planner-channel ${filter === a.id ? 'active' : ''}`}
                            aria-pressed={filter === a.id}
                            onClick={() => setFilter(a.id)}
                        >
                            <Avatar name={a.name} src={a.avatar} />
                            <span>
                                <strong>{a.name}</strong>
                                <small>
                                    <Platform name={a.platform} />
                                </small>
                            </span>
                        </button>
                    ))}
                    {!accounts.length && !socialLoading && <p>Chưa có tài khoản được xác minh.</p>}
                </details>
                <details className="planner-account-group">
                    <summary>Nền tảng khác</summary>
                    {window.Omni.platforms
                        .filter((p) => !accounts.some((a) => a.platform === p))
                        .map((p) => (
                            <div className="planner-provider" key={p}>
                                <Platform name={p} />
                                <small>{p === 'Facebook' ? 'Chưa kết nối' : 'Chưa tích hợp'}</small>
                            </div>
                        ))}
                </details>
            </aside>
            <section className="planner-main">
                <div className="planner-heading">
                    <div>
                        <h2>Lịch nội dung</h2>
                        <p>Bản soạn, kế hoạch và kết quả từng lượt đăng.</p>
                    </div>
                    <div className="planner-view" role="group" aria-label="Chế độ lịch">
                        {[
                            ['day', 'Ngày'],
                            ['week', 'Tuần'],
                            ['month', 'Tháng']
                        ].map(([v, label]) => (
                            <button
                                aria-pressed={view === v}
                                className={view === v ? 'active' : ''}
                                onClick={() => setView(v)}
                                key={v}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="planner-controls">
                    <div>
                        <button
                            className="icon-button"
                            aria-label="Kỳ trước"
                            onClick={() => shift(-1)}
                        >
                            <ChevronLeft size={17} />
                        </button>
                        <label>
                            <CalendarDays size={16} />
                            <input
                                aria-label="Ngày xem lịch"
                                type="date"
                                value={date}
                                onChange={(e) => e.target.value && setDate(e.target.value)}
                            />
                        </label>
                        <button
                            className="icon-button"
                            aria-label="Kỳ sau"
                            onClick={() => shift(1)}
                        >
                            <ChevronRight size={17} />
                        </button>
                        <Button onClick={() => setDate(window.Omni.today)}>Hôm nay</Button>
                    </div>
                    <label>
                        Múi giờ
                        <select
                            aria-label="Múi giờ lịch"
                            value={zone}
                            onChange={(e) => setZone(e.target.value)}
                        >
                            {Object.entries(zones).map(([z, o]) => (
                                <option value={z} key={z}>
                                    GMT{o ? `+${o}` : ''} · {z}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="planner-status" role="status">
                    {loading
                        ? 'Đang tải kế hoạch…'
                        : server?.ready
                          ? `PostgreSQL · ${server.workerEnabled ? 'Worker đã bật cấu hình; cần chạy tiến trình worker' : 'Worker đang tắt — kế hoạch chưa tự đăng'}`
                          : 'Chưa kết nối kho kế hoạch server · Bản soạn workspace vẫn hiển thị'}
                    <button
                        className="text-link"
                        onClick={() => {
                            reload();
                            setPlatformRefresh((r) => r + 1);
                        }}
                        disabled={loading || platformLoading}
                    >
                        Làm mới
                    </button>
                </div>
                {error && (
                    <p role="alert" className="social-alert">
                        {error}
                    </p>
                )}
                {notice && (
                    <p role="status" className="social-alert">
                        {notice}
                    </p>
                )}
                {platformLoading && (
                    <p className="planner-status" role="status">
                        Đang đồng bộ bài đã đăng từ Facebook…
                    </p>
                )}
                {platformError && (
                    <p role="alert" className="social-alert">
                        Chưa đồng bộ đầy đủ bài trên Page: {platformError}
                        <Button onClick={() => setPlatformRefresh((r) => r + 1)}>Thử lại</Button>
                    </p>
                )}
                <div
                    className="planner-state-filters"
                    role="group"
                    aria-label="Trạng thái bài viết"
                >
                    {publishingStates.map((state) => (
                        <button
                            key={state}
                            aria-pressed={stateFilter === state}
                            className={stateFilter === state ? 'active' : ''}
                            onClick={() => setStateFilter(state)}
                        >
                            {state}
                            <span>
                                {
                                    events.filter((e) => state === 'Tất cả' || e.status === state)
                                        .length
                                }
                            </span>
                        </button>
                    ))}
                </div>
                {stateFilter === 'Đã hủy' && (
                    <p className="planner-empty">
                        Hiển thị bài đã hủy ở mọi ngày trong các kế hoạch đã tải. Sửa thời gian
                        tương lai rồi gửi lại lên workspace để duyệt.
                    </p>
                )}
                {!loading &&
                    !visibleEvents.some(
                        (e) => stateFilter === 'Đã hủy' || days.includes(e.date)
                    ) && (
                        <p className="planner-empty">
                            Chưa có nội dung trong kỳ này. Chọn ô giờ để bắt đầu soạn.
                        </p>
                    )}
                {stateFilter === 'Đã hủy' ? (
                    <div className="planner-cancelled-list">{visibleEvents.map(card)}</div>
                ) : (
                    <div
                        ref={scroll}
                        className={`planner-scroll ${view === 'month' ? 'monthly' : ''}`}
                    >
                        {view === 'month' ? (
                            <div className="planner-month">
                                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
                                    <strong key={d}>{d}</strong>
                                ))}
                                {Array.from(
                                    {
                                        length:
                                            (new Date(`${monthStart}T12:00:00Z`).getUTCDay() + 6) %
                                            7
                                    },
                                    (_, i) => (
                                        <div className="planner-month-blank" key={`blank-${i}`} />
                                    )
                                )}
                                {days.map((day) => (
                                    <div className="planner-month-day" key={day}>
                                        <button
                                            onClick={() => create(day, '09:00')}
                                            aria-label={`Thêm nội dung ${day}`}
                                        >
                                            <strong>{day.slice(-2)}</strong>
                                            <Plus size={13} />
                                        </button>
                                        {visibleEvents.filter((e) => e.date === day).map(card)}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div
                                className={`planner-time-grid ${view === 'day' ? 'single-day' : ''}`}
                                style={{
                                    gridTemplateColumns: `64px repeat(${days.length}, minmax(140px, 1fr))`
                                }}
                            >
                                <div className="planner-time-column">
                                    <div className="planner-day-label">
                                        GMT{zones[zone] ? `+${zones[zone]}` : ''}
                                    </div>
                                    {Array.from({ length: 24 }, (_, h) => (
                                        <div className="planner-hour" key={h}>
                                            {String(h).padStart(2, '0')}:00
                                        </div>
                                    ))}
                                </div>
                                {days.map((day) => (
                                    <div className="planner-day-column" key={day}>
                                        <div
                                            className={`planner-day-label ${day === window.Omni.today ? 'today' : ''}`}
                                        >
                                            <span>
                                                {new Date(`${day}T12:00:00Z`).toLocaleDateString(
                                                    'vi-VN',
                                                    { weekday: 'short', timeZone: 'UTC' }
                                                )}
                                            </span>
                                            <strong>{day.slice(-2)}</strong>
                                        </div>
                                        {Array.from({ length: 24 }, (_, h) => (
                                            <div className="planner-hour-slot" key={h}>
                                                <button
                                                    className="planner-slot-create"
                                                    aria-label={`Tạo bài ${day} lúc ${h}:00`}
                                                    onClick={() =>
                                                        create(
                                                            day,
                                                            `${String(h).padStart(2, '0')}:00`
                                                        )
                                                    }
                                                >
                                                    <Plus size={14} />
                                                </button>
                                                <div className="planner-slot-events">
                                                    {visibleEvents
                                                        .filter(
                                                            (e) =>
                                                                e.date === day &&
                                                                Number(e.time.slice(0, 2)) === h
                                                        )
                                                        .map(card)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {next !== null && (
                    <Button
                        disabled={loading}
                        onClick={async () => {
                            setLoading(true);
                            try {
                                const body = await socialRequest(
                                    `/api/publishing/plans?offset=${next}`
                                );
                                setPlans((p) => [...p, ...body.plans]);
                                setNext(body.nextOffset);
                            } catch (e) {
                                setError(e.message);
                            } finally {
                                setLoading(false);
                            }
                        }}
                    >
                        Tải thêm kế hoạch
                    </Button>
                )}
            </section>
            {cancel && (
                <Modal title="Hủy các lượt đăng còn chờ?" onClose={() => !busy && setCancel(null)}>
                    <div className="dialog-body">
                        <p>{cancel.name}. Lượt đã đăng hoặc đang gửi không được thu hồi.</p>
                        <Button kind="danger" disabled={busy || saving} onClick={cancelPlan}>
                            Xác nhận hủy kế hoạch
                        </Button>
                    </div>
                </Modal>
            )}
            {publishNow && (
                <Modal title="Đăng bài đã duyệt ngay?" onClose={() => !busy && setPublishNow(null)}>
                    <div className="dialog-body">
                        <p>
                            Bài sẽ được gửi ngay lên Facebook Page{' '}
                            <strong>
                                {accounts.find((a) => a.id === publishNow.accountIds?.[0])?.name ||
                                    publishNow.accountName ||
                                    publishNow.accountIds?.[0]}
                            </strong>
                            . Lượt đăng theo lịch của bài này sẽ không chạy lại.
                        </p>
                        <p style={{ whiteSpace: 'pre-wrap' }}>{publishNow.content}</p>
                        <Button kind="primary" disabled={busy} onClick={publishApprovedNow}>
                            {busy ? 'Đang đăng…' : 'Xác nhận đăng ngay'}
                        </Button>
                    </div>
                </Modal>
            )}
            {Object.values(platformCursors).some(Boolean) && (
                <Button disabled={platformLoading} onClick={loadPlatformMore}>
                    Tải thêm bài Facebook trong kỳ này
                </Button>
            )}
            {publishedPreview && (
                <Modal title="Bài đã đăng trên Facebook" onClose={() => setPublishedPreview(null)}>
                    <div className="dialog-body">
                        <p>
                            <strong>{publishedPreview.accountName}</strong> ·{' '}
                            {publishedPreview.date} {publishedPreview.time} · Đã đăng
                        </p>
                        <p style={{ whiteSpace: 'pre-wrap' }}>{publishedPreview.content}</p>
                        {publishedPreview.image && (
                            <img
                                src={publishedPreview.image}
                                alt="Ảnh bài đã đăng"
                                style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain' }}
                            />
                        )}
                        {publishedPreview.permalink && (
                            <a
                                className="button"
                                href={publishedPreview.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Xem trên Facebook
                            </a>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
}

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2, RefreshCw, Image, Pencil, Trash2, Plus } from 'lucide-react';
import { useWorkspace } from './App.jsx';
import { Avatar, Badge, Button, Empty, Modal, Panel, Platform } from './components.jsx';
import { EntityPage } from './pages.jsx';
import PublishingCalendar from './PublishingCalendar.jsx';
import ApprovalBoard from './ApprovalBoard.jsx';
import { apiFetch } from './Auth.jsx';

export async function socialRequest(url, options = {}) {
    const response = await apiFetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Không thể hoàn tất yêu cầu.');
    return body;
}
export function Connections() {
    const {
        social,
        socialLoading,
        socialError,
        refreshSocial,
        navigate,
        compose,
        selectSocialAccount
    } = useWorkspace();
    const [pages, setPages] = useState([]);
    const [selected, setSelected] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(
        () => new URLSearchParams(location.search).get('social_error') || ''
    );
    const [disconnect, setDisconnect] = useState(null);
    const [notice, setNotice] = useState('');
    useEffect(() => {
        let active = true;
        socialRequest('/api/social/facebook/pages')
            .then((body) => {
                if (active) setPages(body.pages);
            })
            .catch((e) => {
                if (active) setError(e.message);
            });
        return () => {
            active = false;
        };
    }, []);
    async function connectSelected() {
        setBusy(true);
        setError('');
        try {
            await socialRequest('/api/social/facebook/pages', {
                method: 'POST',
                body: JSON.stringify({ pageIds: selected })
            });
            setPages([]);
            setSelected([]);
            setNotice('Đã liên kết Page. Có thể xem bài và đăng nội dung.');
            await refreshSocial();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    async function removeConnection() {
        setBusy(true);
        setError('');
        try {
            await socialRequest(`/api/social/accounts/${encodeURIComponent(disconnect.id)}`, {
                method: 'DELETE'
            });
            setDisconnect(null);
            await refreshSocial();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="social-page">
            <Panel
                title="Tài khoản mạng xã hội"
                subtitle="Danh tính và trạng thái được xác minh qua API, không dùng tài khoản mẫu."
                action={
                    <Button icon={RefreshCw} disabled={socialLoading} onClick={refreshSocial}>
                        Kiểm tra lại
                    </Button>
                }
            >
                {(error || socialError) && (
                    <div className="social-alert" role="alert">
                        {error || socialError}
                    </div>
                )}
                {notice && (
                    <p className="social-success" role="status">
                        {notice}
                    </p>
                )}
                {socialLoading ? (
                    <p role="status">Đang kiểm tra các tài khoản…</p>
                ) : (
                    <div className="account-grid">
                        {social.accounts.map((account) => (
                            <article className="account-card" key={account.id}>
                                <div className="account-heading">
                                    <Avatar name={account.name} src={account.avatar} />
                                    <div>
                                        <strong>{account.name}</strong>
                                        <small>
                                            <Platform name={account.platform} /> · ID{' '}
                                            {account.instagramUserId || account.pageId}
                                        </small>
                                        {account.platform === 'Instagram' && account.pageId && (
                                            <small>
                                                Liên kết Facebook Page ID {account.pageId}
                                            </small>
                                        )}
                                    </div>
                                </div>
                                <Badge
                                    value={
                                        account.status === 'connected'
                                            ? 'Đã kết nối'
                                            : 'Cần kết nối lại'
                                    }
                                />
                                {account.error && <p className="danger-text">{account.error}</p>}
                                {account.publishBlockedReason && (
                                    <p className="hint">{account.publishBlockedReason}</p>
                                )}
                                {account.instagramLinkError && (
                                    <p className="hint">
                                        Kiểm tra liên kết Instagram: {account.instagramLinkError}
                                    </p>
                                )}
                                <div className="account-actions">
                                    <Button
                                        disabled={!account.canPublish}
                                        onClick={() =>
                                            compose({
                                                accountId: account.id,
                                                channels: [account.platform],
                                                platform: account.platform
                                            })
                                        }
                                        icon={Plus}
                                    >
                                        Tạo bài viết
                                    </Button>
                                    <Button
                                        disabled={
                                            !account.canPublish || account.platform === 'Instagram'
                                        }
                                        onClick={() => {
                                            selectSocialAccount(account.id);
                                            navigate('posts');
                                        }}
                                    >
                                        {account.platform === 'Instagram'
                                            ? 'Đọc bài Instagram chưa hỗ trợ'
                                            : 'Xem bài trên Page'}
                                    </Button>
                                    {account.source === 'oauth' && (
                                        <Button
                                            kind="danger"
                                            onClick={() => setDisconnect(account)}
                                        >
                                            Ngắt liên kết
                                        </Button>
                                    )}
                                </div>
                                <p className="hint">
                                    {account.source === 'env'
                                        ? 'Kết nối bằng token cấu hình trên backend.'
                                        : 'Kết nối bằng Facebook Login; token được mã hóa trên backend.'}
                                </p>
                            </article>
                        ))}
                        {!social.accounts.length && (
                            <Empty
                                title="Chưa có tài khoản được liên kết"
                                description="Liên kết Facebook hoặc cấu hình Page Token hợp lệ trên backend để bắt đầu."
                            />
                        )}
                    </div>
                )}
            </Panel>
            {!!pages.length && (
                <Panel
                    title="Chọn Page được phép quản lý"
                    subtitle="Chỉ Page được Facebook cấp quyền tạo nội dung mới có trong danh sách."
                >
                    <div className="page-picker">
                        {pages.map((page) => (
                            <label key={page.id}>
                                <input
                                    type="checkbox"
                                    checked={selected.includes(page.id)}
                                    onChange={(e) =>
                                        setSelected((current) =>
                                            e.target.checked
                                                ? [...current, page.id]
                                                : current.filter((id) => id !== page.id)
                                        )
                                    }
                                />
                                <Avatar name={page.name} src={page.avatar} />
                                <span>
                                    {page.name}
                                    <small>ID {page.id}</small>
                                    {page.instagramAccount && (
                                        <small>
                                            Instagram đã liên kết
                                            {page.instagramAccount.username
                                                ? ` @${page.instagramAccount.username}`
                                                : ` ID ${page.instagramAccount.id}`}
                                        </small>
                                    )}
                                </span>
                            </label>
                        ))}
                    </div>
                    <Button
                        kind="primary"
                        disabled={busy || !selected.length}
                        onClick={connectSelected}
                    >
                        {busy ? 'Đang liên kết…' : 'Liên kết Page đã chọn'}
                    </Button>
                </Panel>
            )}
            <Panel
                title="Thêm kết nối"
                subtitle="Cấp quyền tại trang chính thức của nền tảng. Không nhập token vào frontend."
            >
                <div className="provider-grid">
                    {social.providers.map((provider) => (
                        <div className="provider-card" key={provider.name}>
                            <Platform name={provider.name} />
                            <p>
                                {provider.name === 'Instagram'
                                    ? 'Tài khoản Professional liên kết với Page có thể được phát hiện. Đăng local dùng Cloudflare Tunnel tạm; triển khai cần kho media công khai.'
                                    : provider.supported
                                      ? 'Liên kết Page, xem/sửa/xóa bài đã đăng và đăng văn bản kèm ảnh.'
                                      : 'Chưa triển khai adapter/API cho nền tảng này. Tài khoản sẽ không xuất hiện trong trình soạn.'}
                            </p>
                            {provider.supported && social.oauthConfigured ? (
                                <a className="button primary" href="/api/social/facebook/connect">
                                    <Link2 size={16} /> Liên kết Facebook
                                </a>
                            ) : (
                                <Button disabled>
                                    {provider.supported
                                        ? 'Cần cấu hình ứng dụng Meta'
                                        : 'Chưa hỗ trợ kết nối'}
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
                {!social.oauthConfigured && (
                    <p className="hint">
                        Luồng cấp quyền cần App ID, App Secret và URL callback của ứng dụng Meta
                        trên backend. Page Token trong BE/.env vẫn dùng được độc lập.
                    </p>
                )}
            </Panel>
            {disconnect && (
                <Modal title="Ngắt liên kết tài khoản?" onClose={() => setDisconnect(null)}>
                    <div className="dialog-body">
                        <p>
                            Ngừng quản lý {disconnect.name} trong Omni Studio. Bài trên Facebook
                            không bị xóa; quyền ứng dụng tại Meta không tự bị thu hồi.
                        </p>
                        {error && (
                            <p role="alert" className="danger-text">
                                {error}
                            </p>
                        )}
                        <Button kind="danger" disabled={busy} onClick={removeConnection}>
                            Xác nhận ngắt liên kết
                        </Button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
export function SocialPosts({ initialTab = 'planner' }) {
    const {
        social,
        socialLoading,
        socialError,
        refreshSocial,
        navigate,
        compose,
        socialRevision,
        workspaceError,
        useLocalWorkspace,
        activeSocialAccountId,
        selectSocialAccount
    } = useWorkspace();
    const [platform, setPlatform] = useState(
        () => social.accounts.find((a) => a.id === activeSocialAccountId)?.platform || 'Facebook'
    );
    const provider = social.providers.find((p) => p.name === platform);
    const accounts = social.accounts.filter(
        (a) => a.status === 'connected' && a.platform === platform
    );
    const [tab, setTab] = useState(initialTab);
    useEffect(() => setTab(initialTab), [initialTab]);
    const [accountId, setAccountId] = useState(activeSocialAccountId);
    const [posts, setPosts] = useState([]);
    const [plannedPostIds, setPlannedPostIds] = useState(new Set());
    const [plansLoaded, setPlansLoaded] = useState(false);
    const [cursor, setCursor] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [action, setAction] = useState(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const selected = accounts.find((a) => a.id === accountId) || accounts[0];
    const currentAccount = useRef(selected?.id);
    currentAccount.current = selected?.id;
    useEffect(() => {
        if (!accounts.some((a) => a.id === accountId)) setAccountId(accounts[0]?.id || '');
    }, [social.accounts, platform, accountId]);
    useEffect(() => {
        let active = true;
        setPosts([]);
        setCursor(null);
        setError('');
        setNotice('');
        setLoading(false);
        if (!selected || tab !== 'page') return;
        setLoading(true);
        socialRequest(`/api/social/accounts/${encodeURIComponent(selected.id)}/posts`)
            .then((body) => {
                if (active) {
                    setPosts(body.posts);
                    setCursor(body.nextCursor);
                }
            })
            .catch((e) => {
                if (active) setError(e.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [selected?.id, tab, socialRevision]);
    useEffect(() => {
        if (tab !== 'page' || !selected) return;
        let active = true;
        setPlansLoaded(false);
        (async () => {
            const ids = new Set();
            let offset = 0;
            do {
                const body = await socialRequest(
                    `/api/publishing/plans?limit=100&offset=${offset}`
                );
                body.plans.forEach((plan) =>
                    plan.deliveries?.forEach((delivery) => {
                        if (delivery.account_id === selected.id && delivery.provider_post_id)
                            ids.add(delivery.provider_post_id);
                    })
                );
                offset = body.nextOffset ?? null;
            } while (offset !== null);
            if (active) {
                setPlannedPostIds(ids);
                setPlansLoaded(true);
            }
        })().catch(() => {
            if (active) setPlansLoaded(false);
        });
        return () => {
            active = false;
        };
    }, [selected?.id, tab, socialRevision]);
    async function loadMore(reset = false) {
        if (!selected) return;
        setLoading(true);
        setError('');
        try {
            const body = await socialRequest(
                `/api/social/accounts/${encodeURIComponent(selected.id)}/posts${!reset && cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`
            );
            if (currentAccount.current !== selected.id) return;
            setPosts((current) =>
                reset
                    ? body.posts
                    : [...new Map([...current, ...body.posts].map((p) => [p.id, p])).values()]
            );
            setCursor(body.nextCursor);
        } catch (e) {
            if (currentAccount.current === selected.id) setError(e.message);
        } finally {
            if (currentAccount.current === selected.id) setLoading(false);
        }
    }
    async function submitAction() {
        setBusy(true);
        setError('');
        try {
            await socialRequest(
                `/api/social/accounts/${encodeURIComponent(selected.id)}/posts/${encodeURIComponent(action.post.id)}`,
                {
                    method: action.type === 'edit' ? 'PATCH' : 'DELETE',
                    ...(action.type === 'edit' ? { body: JSON.stringify({ message }) } : {})
                }
            );
            setPosts((current) =>
                action.type === 'delete'
                    ? current.filter((p) => p.id !== action.post.id)
                    : current.map((p) => (p.id === action.post.id ? { ...p, message } : p))
            );
            setNotice(
                action.type === 'delete'
                    ? 'Đã xóa bài trên Facebook.'
                    : 'Đã cập nhật nội dung trên Facebook.'
            );
            window.dispatchEvent(new Event('platform-posts-changed'));
            setAction(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="social-page">
            {workspaceError && (
                <div className="social-alert" role="alert">
                    Workspace chưa tải được. Bài trên Page vẫn được đọc trực tiếp; nháp/lịch chưa
                    thể lưu.
                    <Button onClick={useLocalWorkspace}>Mở dữ liệu cục bộ để lưu nháp</Button>
                </div>
            )}
            <div className="social-toolbar">
                <div className="inbox-tabs">
                    <button
                        className={tab === 'planner' ? 'active' : ''}
                        onClick={() => setTab('planner')}
                    >
                        Lịch & kế hoạch
                    </button>
                    <button
                        className={tab === 'approvals' ? 'active' : ''}
                        onClick={() => setTab('approvals')}
                    >
                        Duyệt bài viết
                    </button>
                    <button
                        className={tab === 'page' ? 'active' : ''}
                        onClick={() => setTab('page')}
                    >
                        Bài trên nền tảng
                    </button>
                    <button
                        className={tab === 'local' ? 'active' : ''}
                        onClick={() => setTab('local')}
                    >
                        Nháp & lịch trong workspace
                    </button>
                </div>
                <Button icon={Link2} onClick={() => navigate('connections')}>
                    Quản lý liên kết
                </Button>
            </div>
            {tab === 'planner' ? (
                <PublishingCalendar />
            ) : tab === 'approvals' ? (
                <ApprovalBoard />
            ) : tab === 'local' ? (
                <EntityPage kind="posts" />
            ) : (
                <Panel
                    title={`Bài viết từ ${platform}`}
                    subtitle="Quản lý bài đã đăng theo nền tảng và tài khoản đã kết nối. Nháp và lịch đăng nằm trong workspace."
                    action={
                        <Button
                            icon={RefreshCw}
                            disabled={loading || socialLoading}
                            onClick={() => {
                                refreshSocial();
                                loadMore(true);
                            }}
                        >
                            Làm mới
                        </Button>
                    }
                >
                    <div className="social-posts-body">
                        <div
                            className="social-platforms"
                            role="group"
                            aria-label="Lọc nền tảng bài viết"
                        >
                            {social.providers.map((p) => {
                                const count = social.accounts.filter(
                                    (a) => a.status === 'connected' && a.platform === p.name
                                ).length;
                                return (
                                    <button
                                        key={p.name}
                                        className={`social-platform-option ${platform === p.name ? 'active' : ''}`}
                                        aria-pressed={platform === p.name}
                                        onClick={() => setPlatform(p.name)}
                                    >
                                        <Platform name={p.name} />
                                        <small>
                                            {count
                                                ? `${count} đã kết nối`
                                                : p.supported
                                                  ? 'Chưa kết nối'
                                                  : 'Chưa tích hợp'}
                                        </small>
                                    </button>
                                );
                            })}
                        </div>
                        {notice && (
                            <p className="social-success" role="status">
                                {notice}
                            </p>
                        )}
                        {(error || socialError) && (
                            <div role="alert" className="social-alert">
                                {error || socialError}
                                <Button onClick={() => loadMore(true)}>Thử lại</Button>
                            </div>
                        )}
                        {!!accounts.length && (
                            <div className="social-account-toolbar">
                                <div className="social-account-control">
                                    <Avatar name={selected.name} src={selected.avatar} />
                                    <label className="social-account-select">
                                        <span>Trang / tài khoản đăng bài</span>
                                        <select
                                            aria-label="Tài khoản quản lý bài viết"
                                            value={selected?.id || ''}
                                            onChange={(e) => {
                                                setAccountId(e.target.value);
                                                selectSocialAccount(e.target.value);
                                            }}
                                        >
                                            {accounts.map((a) => (
                                                <option value={a.id} key={a.id}>
                                                    {a.name} · {a.platform}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                                <Button
                                    icon={Plus}
                                    kind="primary"
                                    disabled={!selected.canPublish}
                                    onClick={() =>
                                        compose({
                                            accountId: selected.id,
                                            channels: [selected.platform],
                                            platform: selected.platform
                                        })
                                    }
                                >
                                    Tạo bài viết
                                </Button>
                            </div>
                        )}
                        {!accounts.length && !socialLoading && (
                            <Empty
                                title={
                                    provider?.supported
                                        ? `Chưa có tài khoản ${platform} đã kết nối`
                                        : `${platform} chưa được tích hợp`
                                }
                                description={
                                    provider?.supported
                                        ? 'Liên kết và cấp quyền cho tài khoản để đọc bài viết và đăng nội dung.'
                                        : `Cần tích hợp API và luồng cấp quyền của ${platform} trước khi có thể đăng hoặc đồng bộ bài viết. Hiện hệ thống hỗ trợ Facebook Page.`
                                }
                                action={
                                    <Button onClick={() => navigate('connections')}>
                                        Quản lý kết nối
                                    </Button>
                                }
                            />
                        )}
                        {(loading || socialLoading) && <p role="status">Đang tải bài viết…</p>}
                        {selected && !loading && !error && !posts.length && (
                            <Empty
                                title="Page chưa có bài viết"
                                description="Đăng bài đầu tiên hoặc thử làm mới danh sách."
                            />
                        )}
                        <div className="social-post-list">
                            {posts.map((post) => (
                                <article className="remote-post" key={post.id}>
                                    <div className="account-heading">
                                        <Avatar
                                            name={selected?.name || 'Page'}
                                            src={selected?.avatar}
                                        />
                                        <div>
                                            <strong>{selected?.name}</strong>
                                            <small>
                                                {new Date(post.createdTime).toLocaleString(
                                                    'vi-VN',
                                                    {
                                                        timeZone: 'Asia/Ho_Chi_Minh'
                                                    }
                                                )}
                                            </small>
                                        </div>
                                        <Badge value="Đã đăng" />
                                    </div>
                                    {plansLoaded && (
                                        <small className="remote-post-origin">
                                            {plannedPostIds.has(post.id)
                                                ? 'Có trong lịch và quy trình duyệt'
                                                : 'Không khớp ID bài trong kế hoạch duyệt'}
                                        </small>
                                    )}
                                    <p className="remote-post-message">
                                        {post.message || 'Bài viết không có nội dung văn bản.'}
                                    </p>
                                    {post.image && (
                                        <img
                                            src={post.image}
                                            alt="Ảnh bài viết trên Page"
                                            className="remote-post-image"
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                        />
                                    )}
                                    <div className="account-actions">
                                        {post.permalink && (
                                            <a
                                                className="button"
                                                href={post.permalink}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <ExternalLink size={15} /> Xem trên Facebook
                                            </a>
                                        )}
                                        <Button
                                            icon={Pencil}
                                            onClick={() => {
                                                setAction({ type: 'edit', post });
                                                setMessage(post.message);
                                                setError('');
                                            }}
                                        >
                                            Sửa nội dung
                                        </Button>
                                        <Button
                                            icon={Trash2}
                                            kind="danger"
                                            onClick={() => {
                                                setAction({ type: 'delete', post });
                                                setError('');
                                            }}
                                        >
                                            Xóa bài
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                        {cursor && (
                            <Button disabled={loading} onClick={() => loadMore()}>
                                Tải thêm bài cũ
                            </Button>
                        )}
                    </div>
                </Panel>
            )}
            {action && (
                <Modal
                    title={
                        action.type === 'edit' ? 'Sửa bài trên Facebook' : 'Xóa bài trên Facebook?'
                    }
                    onClose={() => !busy && setAction(null)}
                >
                    <div className="dialog-body">
                        <p>
                            {action.type === 'edit'
                                ? `Thay đổi sẽ được cập nhật trực tiếp lên ${selected.name}. Chỉ sửa văn bản; không thay ảnh ở đây.`
                                : `Bài sẽ bị xóa thật khỏi ${selected.name}. Thao tác này không có nút hoàn tác trong Omni Studio.`}
                        </p>
                        {action.type === 'edit' && (
                            <label className="social-edit-label">
                                Nội dung
                                <textarea
                                    aria-label="Nội dung sửa bài Facebook"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    maxLength={63206}
                                />
                            </label>
                        )}
                        {error && (
                            <p role="alert" className="danger-text">
                                {error}
                            </p>
                        )}
                        <Button
                            kind={action.type === 'delete' ? 'danger' : 'primary'}
                            disabled={busy || (action.type === 'edit' && !message.trim())}
                            onClick={submitAction}
                        >
                            {busy
                                ? 'Đang xử lý…'
                                : action.type === 'edit'
                                  ? 'Xác nhận cập nhật'
                                  : 'Xác nhận xóa bài thật'}
                        </Button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

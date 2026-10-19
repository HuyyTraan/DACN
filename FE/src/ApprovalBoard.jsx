import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useWorkspace } from './App.jsx';
import { Button, Modal, exportRows } from './components.jsx';
import { fromPlan } from './publishing-model.mjs';
import { socialRequest } from './Social.jsx';

const labels = {
    pending: 'Chưa duyệt',
    scheduled: 'Đã duyệt',
    rejected: 'Bị từ chối'
};
const mailLabels = {
    queued: 'Email chờ gửi',
    sending: 'Email đang gửi',
    sent: 'Email đã gửi',
    cancelled: 'Email đã hủy'
};
const reviewStatus = (item) =>
    item.publishedCount > 0
        ? item.publishedCount === item.deliveryCount
            ? 'Đã đăng'
            : 'Đã đăng một phần'
        : labels[item.status];
const dateTime = (value) =>
    value
        ? new Date(value).toLocaleString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
              hour12: false,
              dateStyle: 'short',
              timeStyle: 'short'
          })
        : '—';

export default function ApprovalBoard() {
    const { user, social, compose } = useWorkspace();
    const canReview = ['admin', 'manager'].includes(user.role);
    const [status, setStatus] = useState('all');
    const [query, setQuery] = useState('');
    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState({ pending: 0, scheduled: 0, rejected: 0 });
    const [nextOffset, setNextOffset] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [rejecting, setRejecting] = useState(null);
    const [reason, setReason] = useState('');
    const [detail, setDetail] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [routeHash, setRouteHash] = useState(location.hash);
    const targetId = /^#posts\/approvals\/([0-9a-f-]{36})$/i.exec(routeHash)?.[1] || '';
    useEffect(() => {
        const onHashChange = () => {
            setRouteHash(location.hash);
            setDetail(null);
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);
    async function load(offset = 0, filter = status) {
        setLoading(true);
        setError('');
        try {
            const body = await socialRequest(
                `/api/publishing/approvals?status=${filter}&limit=50&offset=${offset}${targetId ? `&planId=${encodeURIComponent(targetId)}` : ''}`
            );
            setItems((current) => (offset ? [...current, ...body.items] : body.items));
            setCounts(body.counts);
            setNextOffset(body.nextOffset);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        load(0, status);
        const refresh = () => load(0, status);
        window.addEventListener('publishing-plans-changed', refresh);
        const timer = setInterval(refresh, 30000);
        return () => {
            window.removeEventListener('publishing-plans-changed', refresh);
            clearInterval(timer);
        };
    }, [status, targetId]);
    const visible = items.filter((item) =>
        [item.name, item.items?.[0]?.content, item.createdByName, item.reviewedByName]
            .filter(Boolean)
            .some((value) => value.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))
    );
    async function decide(item, action) {
        setBusy(true);
        setError('');
        try {
            await socialRequest(`/api/publishing/plans/${item.id}/${action}`, {
                method: 'POST',
                body: JSON.stringify({
                    version: item.version,
                    ...(action === 'reject' ? { reason: reason.trim() } : {})
                })
            });
            setRejecting(null);
            setReason('');
            setNotice(
                action === 'approve' ? 'Đã duyệt và lên lịch bài viết.' : 'Đã từ chối bài viết.'
            );
            await load();
            window.dispatchEvent(new Event('publishing-plans-changed'));
        } catch (e) {
            setError(e.message);
            await load();
        } finally {
            setBusy(false);
        }
    }
    async function deletePlan() {
        if (!deleting || user.role !== 'admin') return;
        setBusy(true);
        setError('');
        try {
            await socialRequest(`/api/publishing/plans/${deleting.id}`, {
                method: 'DELETE',
                body: JSON.stringify({ version: deleting.version })
            });
            setDeleting(null);
            setDetail(null);
            setNotice('Đã xóa bài khỏi Omni Studio. Bài trên Facebook không bị xóa.');
            await load();
            window.dispatchEvent(new Event('publishing-plans-changed'));
        } catch (e) {
            setError(e.message);
            await load();
        } finally {
            setBusy(false);
        }
    }
    function accountNames(item) {
        return (item.accountIds || [])
            .map((id) => social.accounts.find((account) => account.id === id)?.name || id)
            .join(', ');
    }
    function download() {
        exportRows(
            visible.map((item) => ({
                name: item.name,
                status: reviewStatus(item),
                creator: item.createdByName || '—',
                account: accountNames(item),
                scheduledAt: dateTime(item.scheduledAt),
                reviewer: item.reviewedByName || '—',
                reviewedAt: dateTime(item.reviewedAt),
                reason: item.rejectionReason || ''
            })),
            [
                ['name', 'Bài viết'],
                ['status', 'Trạng thái'],
                ['creator', 'Người tạo'],
                ['account', 'Page'],
                ['scheduledAt', 'Giờ đăng dự kiến'],
                ['reviewer', 'Người duyệt / từ chối'],
                ['reviewedAt', 'Thời điểm xử lý'],
                ['reason', 'Lý do từ chối']
            ].map(([key, label]) => ({ key, label })),
            'duyet-bai-viet'
        );
    }
    return (
        <section className="approval-board">
            <div className="approval-heading">
                <div>
                    <h2>Duyệt bài viết</h2>
                    <p>Theo dõi quyết định duyệt của Admin và Manager trên từng kế hoạch.</p>
                </div>
                <div className="approval-heading-actions">
                    {targetId && (
                        <Button onClick={() => (location.hash = 'posts/approvals')}>
                            Xem tất cả bài
                        </Button>
                    )}
                    <Button icon={RefreshCw} disabled={loading} onClick={() => load()}>
                        Làm mới
                    </Button>
                    <Button icon={Download} disabled={!visible.length} onClick={download}>
                        Xuất CSV
                    </Button>
                </div>
            </div>
            <div className="approval-toolbar">
                <div className="approval-filters" role="group" aria-label="Lọc trạng thái duyệt">
                    {[
                        ['all', 'Tất cả'],
                        ['pending', 'Chưa duyệt'],
                        ['scheduled', 'Đã duyệt'],
                        ['rejected', 'Bị từ chối']
                    ].map(([key, label]) => (
                        <button
                            key={key}
                            className={status === key ? 'active' : ''}
                            aria-pressed={status === key}
                            onClick={() => setStatus(key)}
                        >
                            {label}{' '}
                            <span>
                                {key === 'all'
                                    ? Object.values(counts).reduce((a, b) => a + b, 0)
                                    : counts[key]}
                            </span>
                        </button>
                    ))}
                </div>
                <label className="approval-search">
                    <Search size={16} />
                    <input
                        aria-label="Tìm bài cần duyệt"
                        placeholder="Tìm tên bài, nội dung, người tạo…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </label>
            </div>
            {error && (
                <p className="social-alert" role="alert">
                    {error}
                </p>
            )}
            {notice && (
                <p className="approval-notice" role="status">
                    {notice}
                </p>
            )}
            <div
                className="approval-grid"
                role="region"
                aria-label="Bảng duyệt bài viết"
                tabIndex="0"
            >
                <table>
                    <colgroup>
                        {[44, 280, 140, 130, 200, 170, 170, 160, 180, 190].map((width, index) => (
                            <col key={index} style={{ width }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th scope="col">#</th>
                            <th scope="col">Bài viết</th>
                            <th scope="col">Trạng thái</th>
                            <th scope="col">Người tạo</th>
                            <th scope="col">Page</th>
                            <th scope="col">Giờ đăng dự kiến</th>
                            <th scope="col">Người duyệt / từ chối</th>
                            <th scope="col">Thời điểm xử lý</th>
                            <th scope="col">Lý do</th>
                            <th scope="col">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((item, index) => (
                            <tr
                                key={item.id}
                                data-plan-id={item.id}
                                data-plan-version={item.version}
                                className={item.publishedCount > 0 ? 'is-published' : ''}
                            >
                                <td>{index + 1}</td>
                                <td>
                                    <button
                                        className="approval-link"
                                        title={item.name}
                                        onClick={() => setDetail(item)}
                                    >
                                        {item.name}
                                    </button>
                                </td>
                                <td>
                                    <span
                                        className={`approval-state state-${item.publishedCount > 0 ? 'published' : item.status}`}
                                    >
                                        {reviewStatus(item)}
                                    </span>
                                </td>
                                <td title={item.createdByName || ''}>
                                    {item.createdByName || '—'}
                                </td>
                                <td title={accountNames(item)}>{accountNames(item) || '—'}</td>
                                <td>{dateTime(item.scheduledAt)}</td>
                                <td title={item.reviewedByName || ''}>
                                    {item.reviewedByName || '—'}
                                </td>
                                <td>{dateTime(item.reviewedAt)}</td>
                                <td title={item.rejectionReason || ''}>
                                    {item.rejectionReason || '—'}
                                </td>
                                <td>
                                    <div className="approval-actions">
                                        <button onClick={() => setDetail(item)}>
                                            Xem chi tiết
                                        </button>
                                        {user.role === 'admin' && (
                                            <button
                                                className="approval-delete"
                                                disabled={busy}
                                                onClick={() => setDeleting(item)}
                                                aria-label={`Xóa bài ${item.name} khỏi Omni Studio`}
                                            >
                                                <Trash2 size={13} aria-hidden="true" /> Xóa
                                            </button>
                                        )}
                                        {item.isLocked ? (
                                            <span className="approval-locked">
                                                {item.publishedCount > 0
                                                    ? 'Đã đăng · khóa'
                                                    : 'Đang xử lý · khóa'}
                                            </span>
                                        ) : item.status === 'pending' && canReview ? (
                                            <>
                                                <button
                                                    disabled={busy}
                                                    onClick={() => decide(item, 'approve')}
                                                >
                                                    Duyệt
                                                </button>
                                                <button
                                                    disabled={busy}
                                                    onClick={() => {
                                                        setRejecting(item);
                                                        setReason('');
                                                    }}
                                                >
                                                    Từ chối
                                                </button>
                                            </>
                                        ) : null}
                                        {!item.isLocked &&
                                            item.status === 'rejected' &&
                                            user.role !== 'viewer' && (
                                                <button
                                                    onClick={() =>
                                                        compose(fromPlan(item, social.accounts))
                                                    }
                                                >
                                                    Sửa & gửi lại
                                                </button>
                                            )}
                                        {item.status === 'pending' &&
                                            canReview &&
                                            item.emailStatus && (
                                                <small>{mailLabels[item.emailStatus]}</small>
                                            )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!visible.length && (
                    <p className="approval-empty">
                        {loading ? 'Đang tải bảng duyệt…' : 'Không có bài viết phù hợp.'}
                    </p>
                )}
            </div>
            {nextOffset !== null && (
                <Button disabled={loading} onClick={() => load(nextOffset)}>
                    Tải thêm bài viết
                </Button>
            )}
            {rejecting && (
                <Modal title="Từ chối bài viết" onClose={() => setRejecting(null)}>
                    <div className="dialog-body">
                        <p>{rejecting.name}</p>
                        <label className="approval-reject-field">
                            Lý do để người tạo sửa bài
                            <textarea
                                maxLength={500}
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                            />
                        </label>
                        <div className="dialog-footer">
                            <Button onClick={() => setRejecting(null)}>Đóng</Button>
                            <Button
                                kind="danger"
                                disabled={busy || !reason.trim()}
                                onClick={() => decide(rejecting, 'reject')}
                            >
                                Xác nhận từ chối
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
            {deleting && (
                <Modal title="Xóa bài khỏi Omni Studio?" onClose={() => !busy && setDeleting(null)}>
                    <div className="dialog-body">
                        <p>
                            <strong>{deleting.name}</strong>
                        </p>
                        <p>
                            Thao tác này xóa vĩnh viễn kế hoạch, lịch đăng, dữ liệu duyệt và lịch sử
                            liên quan trong Omni Studio. Bài đã đăng trên Facebook vẫn còn trên
                            Page.
                        </p>
                        <div className="dialog-footer">
                            <Button disabled={busy} onClick={() => setDeleting(null)}>
                                Giữ bài
                            </Button>
                            <Button kind="danger" disabled={busy} onClick={deletePlan}>
                                {busy ? 'Đang xóa…' : 'Xóa khỏi Omni Studio'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
            {detail && (
                <Modal title="Chi tiết bài duyệt" onClose={() => setDetail(null)}>
                    <div className="dialog-body">
                        <h3 className="approval-detail-title" data-testid="approval-name">
                            {detail.name}
                        </h3>
                        <p>
                            <strong>ID bài:</strong>{' '}
                            <span data-testid="approval-plan-id">{detail.id}</span>
                        </p>
                        <p>
                            <strong>Phiên bản:</strong>{' '}
                            <span data-testid="approval-plan-version">{detail.version}</span>
                        </p>
                        <p>
                            <strong>Trạng thái:</strong> {reviewStatus(detail)}
                        </p>
                        {detail.providerPostIds?.length > 0 && (
                            <div>
                                <strong>Bài Facebook đã ghi nhận:</strong>{' '}
                                {detail.providerPostIds.map((id, index) => (
                                    <a
                                        key={id}
                                        href={`https://www.facebook.com/${encodeURIComponent(id)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Xem bài {index + 1} trên Facebook{' '}
                                    </a>
                                ))}
                                <p>
                                    Trạng thái đăng được lưu tại thời điểm Facebook trả kết quả.
                                    Liên kết giúp kiểm tra bài còn hiển thị trên Page hay không.
                                </p>
                            </div>
                        )}
                        <p>
                            <strong>Người tạo:</strong>{' '}
                            <span data-testid="approval-creator">
                                {detail.createdByName || '—'}
                            </span>
                        </p>
                        <p>
                            <strong>Page:</strong>{' '}
                            <span data-testid="approval-pages">{accountNames(detail) || '—'}</span>
                        </p>
                        <p>
                            <strong>Giờ đăng dự kiến:</strong>{' '}
                            <span data-testid="approval-scheduled-at">
                                {dateTime(detail.scheduledAt)}
                            </span>
                        </p>
                        <p>
                            <strong>Người duyệt / từ chối:</strong> {detail.reviewedByName || '—'}
                        </p>
                        <p>
                            <strong>Thời điểm xử lý:</strong> {dateTime(detail.reviewedAt)}
                        </p>
                        {detail.items?.map((content, index) => (
                            <div key={index}>
                                <strong>Nội dung {index + 1}:</strong>
                                <p
                                    className="approval-detail-content"
                                    data-testid="approval-content"
                                >
                                    {content.content}
                                </p>
                            </div>
                        ))}
                        {detail.rejectionReason && (
                            <p>
                                <strong>Lý do từ chối:</strong> {detail.rejectionReason}
                            </p>
                        )}
                    </div>
                </Modal>
            )}
        </section>
    );
}

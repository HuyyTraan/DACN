import React, { useEffect, useState } from 'react';
import { authRequest } from './Auth.jsx';
import { useWorkspace } from './App.jsx';
import { Button, Panel, DataTable, Modal } from './components.jsx';
const labels = {
    admin: 'Quản trị viên',
    manager: 'Quản lý',
    editor: 'Biên tập',
    viewer: 'Chỉ xem'
};
const resources = {
    workflows: 'Workflow',
    workflowRuns: 'Lịch sử workflow',
    metrics: 'Chỉ số kênh/bài viết',
    traffic: 'Sự kiện traffic',
    reports: 'Báo cáo',
    media: 'Thư viện ảnh',
    notifications: 'Thông báo',
    settings: 'Cấu hình',
    tags: 'Nhãn',
    approvals: 'Phiếu duyệt',
    socialAccounts: 'Thông tin tài khoản mạng xã hội'
};
const entityLabels = {
    accounts: 'Tài khoản',
    channels: 'Kênh',
    campaigns: 'Chiến dịch',
    posts: 'Bài viết',
    ads: 'Quảng cáo',
    customers: 'Khách hàng',
    keywords: 'Từ khóa',
    competitors: 'Đối thủ',
    conversations: 'Hội thoại',
    rankChecks: 'Kiểm tra thứ hạng',
    users: 'Người dùng',
    workspace: 'Không gian',
    facebook: 'Facebook Page',
    ...resources
};
const actionLabels = {
    create: 'Tạo mới',
    update: 'Chỉnh sửa',
    delete: 'Xóa',
    post: 'Thực hiện',
    put: 'Cập nhật',
    patch: 'Chỉnh sửa',
    login: 'Đăng nhập',
    bootstrap: 'Tạo admin đầu tiên',
    restore: 'Khôi phục',
    publish: 'Đăng bài',
    'password.change': 'Đổi mật khẩu',
    'password.reset': 'Đặt lại mật khẩu',
    'user.create': 'Tạo thành viên',
    'user.update': 'Cập nhật quyền'
};
const fields = {
    workflows: [
        ['engine', 'Công cụ', ['n8n', 'Robot']],
        ['description', 'Mô tả', 'text'],
        ['url', 'Địa chỉ workflow', 'url']
    ],
    workflowRuns: [
        ['workflowId', 'Mã workflow', 'text'],
        ['status', 'Kết quả', ['pending', 'success', 'failed']],
        ['note', 'Ghi chú', 'text']
    ],
    metrics: [
        ['accountId', 'Mã tài khoản', 'text'],
        ['postId', 'Mã bài viết', 'text'],
        ['measuredAt', 'Thời điểm ghi nhận', 'datetime-local'],
        ['reach', 'Tiếp cận', 'number'],
        ['impressions', 'Hiển thị', 'number'],
        ['clicks', 'Lượt nhấp', 'number'],
        ['interactions', 'Tương tác', 'number'],
        ['spend', 'Chi phí', 'number']
    ],
    traffic: [
        ['customerId', 'Mã khách hàng', 'text'],
        ['source', 'Nguồn truy cập', 'text'],
        ['occurredAt', 'Thời điểm', 'datetime-local'],
        ['visits', 'Lượt truy cập', 'number']
    ],
    reports: [
        ['type', 'Loại báo cáo', ['budget', 'traffic', 'content']],
        ['from', 'Từ ngày', 'date'],
        ['to', 'Đến ngày', 'date']
    ],
    media: [['description', 'Mô tả', 'text']],
    notifications: [
        ['message', 'Nội dung', 'text'],
        ['userId', 'Người nhận (mã tài khoản)', 'text']
    ],
    settings: [
        ['key', 'Tên cấu hình', 'text'],
        ['value', 'Giá trị (không nhập mật khẩu/token)', 'text']
    ],
    tags: [['color', 'Màu nhãn', 'color']],
    approvals: [
        ['postId', 'Mã bài viết', 'text'],
        ['status', 'Quyết định', ['pending', 'approved', 'rejected']],
        ['note', 'Ghi chú', 'text']
    ],
    socialAccounts: [
        ['platform', 'Nền tảng', 'text'],
        ['status', 'Kết nối', 'text']
    ]
};
export default function Administration({ kind }) {
    const { user, data, update, notify, version, reloadWorkspace } = useWorkspace();
    const [snapshots, setSnapshots] = useState([]);
    const [rows, setRows] = useState([]),
        [error, setError] = useState(''),
        [loading, setLoading] = useState(false),
        [cursor, setCursor] = useState(null),
        [resource, setResource] = useState('workflows'),
        [modal, setModal] = useState(null),
        [busy, setBusy] = useState(false);
    const [account, setAccount] = useState({ name: '', email: '', password: '', role: 'editor' }),
        [record, setRecord] = useState(''),
        [password, setPassword] = useState({ currentPassword: '', password: '' });
    async function load(before) {
        setLoading(true);
        setError('');
        try {
            const result = await authRequest(
                kind === 'history'
                    ? '/api/history' + (before ? '?before=' + before : '')
                    : kind === 'team'
                      ? '/api/auth/users'
                      : '/api/records/' + resource
            );
            setRows(
                before
                    ? (prev) => [...prev, ...result.events]
                    : result.events || result.users || result.items
            );
            setCursor(result.nextCursor);
            if (kind === 'history' && ['admin', 'manager'].includes(user.role))
                setSnapshots((await authRequest('/api/snapshots')).snapshots);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        load();
    }, [kind, resource]);
    async function action(fn) {
        setBusy(true);
        setError('');
        try {
            await fn();
            setModal(null);
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    async function importLocal() {
        try {
            const local = window.Omni.load(localStorage);
            const merged = Object.fromEntries(
                Object.keys(data).map((k) => [
                    k,
                    [...data[k], ...local[k].filter((r) => !data[k].some((p) => p.id === r.id))]
                ])
            );
            if (await update(merged, 'Đã nhập dữ liệu trình duyệt vào PostgreSQL')) setModal(null);
        } catch (e) {
            setError(e.message);
        }
    }
    const cols =
        kind === 'history'
            ? [
                  {
                      key: 'created_at',
                      label: 'Thời gian',
                      render: (r) =>
                          new Date(r.created_at).toLocaleString('vi-VN', {
                              timeZone: 'Asia/Ho_Chi_Minh'
                          })
                  },
                  {
                      key: 'actor_name',
                      label: 'Người thực hiện',
                      render: (r) => r.actor_name || 'Hệ thống'
                  },
                  {
                      key: 'action',
                      label: 'Thao tác',
                      render: (r) => actionLabels[r.action] || r.action
                  },
                  {
                      key: 'entity',
                      label: 'Đối tượng',
                      render: (r) =>
                          entityLabels[r.entity] ||
                          entityLabels[r.entity.split('/').filter(Boolean).at(-1)] ||
                          (r.entity.includes('publishing')
                              ? 'Kế hoạch đăng'
                              : r.entity.includes('social')
                                ? 'Liên kết mạng xã hội'
                                : 'Không gian làm việc')
                  },
                  { key: 'entity_id', label: 'Mã bản ghi' }
              ]
            : kind === 'team'
              ? [
                    { key: 'name', label: 'Họ tên' },
                    { key: 'email', label: 'Email' },
                    { key: 'role', label: 'Vai trò', render: (r) => labels[r.role] },
                    {
                        key: 'active',
                        label: 'Trạng thái',
                        render: (r) => (r.active ? 'Hoạt động' : 'Đã khóa')
                    },
                    {
                        key: 'actions',
                        label: 'Quản lý',
                        render: (r) => (
                            <>
                                <select
                                    aria-label={'Vai trò ' + r.email}
                                    disabled={busy}
                                    value={r.role}
                                    onChange={(e) =>
                                        action(() =>
                                            authRequest('/api/auth/users/' + r.id, {
                                                method: 'PATCH',
                                                body: JSON.stringify({
                                                    role: e.target.value,
                                                    active: r.active
                                                })
                                            })
                                        )
                                    }
                                >
                                    {Object.entries(labels).map(([k, v]) => (
                                        <option key={k} value={k}>
                                            {v}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    disabled={busy || r.id === user.id}
                                    onClick={() =>
                                        action(() =>
                                            authRequest('/api/auth/users/' + r.id, {
                                                method: 'PATCH',
                                                body: JSON.stringify({
                                                    role: r.role,
                                                    active: !r.active
                                                })
                                            })
                                        )
                                    }
                                >
                                    {r.active ? 'Khóa' : 'Mở khóa'}
                                </Button>
                                <Button
                                    disabled={busy}
                                    onClick={() => {
                                        setPassword({ currentPassword: '', password: '' });
                                        setModal({ type: 'resetPassword', row: r });
                                    }}
                                >
                                    Đặt lại mật khẩu
                                </Button>
                            </>
                        )
                    }
                ]
              : [
                    { key: 'name', label: 'Tên' },
                    { key: 'status', label: 'Trạng thái' },
                    { key: 'recordVersion', label: 'Phiên bản' },
                    {
                        key: 'actions',
                        label: 'Chi tiết',
                        render: (r) => (
                            <Button
                                onClick={() => {
                                    setRecord(JSON.stringify(r, null, 2));
                                    setModal({ type: 'record', row: r });
                                }}
                            >
                                Mở bản ghi
                            </Button>
                        )
                    }
                ];
    return (
        <>
            <Panel
                className="administration-panel"
                title={
                    kind === 'history'
                        ? 'Lịch sử hoạt động'
                        : kind === 'team'
                          ? 'Thành viên & phân quyền'
                          : 'Dữ liệu chức năng'
                }
                subtitle="Lưu bền vững trong PostgreSQL"
            >
                <div className="toolbar">
                    <Button disabled={loading} onClick={() => load()}>
                        Làm mới
                    </Button>
                    {kind === 'team' && user.role === 'admin' && (
                        <Button onClick={() => setModal({ type: 'user' })}>Thêm thành viên</Button>
                    )}
                    {kind === 'data' && (
                        <>
                            <select
                                aria-label="Loại dữ liệu"
                                value={resource}
                                onChange={(e) => setResource(e.target.value)}
                            >
                                {Object.entries(resources).map(([k, v]) => (
                                    <option key={k} value={k}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                            {['admin', 'manager'].includes(user.role) &&
                                resource !== 'socialAccounts' && (
                                    <Button
                                        onClick={() => {
                                            setRecord(
                                                JSON.stringify(
                                                    { name: '', status: 'draft' },
                                                    null,
                                                    2
                                                )
                                            );
                                            setModal({ type: 'record' });
                                        }}
                                    >
                                        Thêm bản ghi
                                    </Button>
                                )}
                            <Button onClick={() => setModal({ type: 'import' })}>
                                Nhập dữ liệu cũ trên trình duyệt
                            </Button>
                        </>
                    )}
                    <Button onClick={() => setModal({ type: 'password' })}>Đổi mật khẩu</Button>
                </div>
                {error && (
                    <p role="alert" className="form-error">
                        {error}
                    </p>
                )}
                {loading ? (
                    <p role="status">Đang tải…</p>
                ) : (
                    <DataTable rows={rows} columns={cols} />
                )}{' '}
                {cursor && <Button onClick={() => load(cursor)}>Xem hoạt động trước</Button>}
                {kind === 'history' && snapshots.length > 0 && (
                    <details>
                        <summary>Các phiên bản dữ liệu được giữ lại</summary>
                        {snapshots.map((s) => (
                            <div className="settings-row" key={s.id}>
                                <span>
                                    Phiên bản {s.version} ·{' '}
                                    {new Date(s.created_at).toLocaleString('vi-VN')}
                                </span>
                                {user.role === 'admin' && (
                                    <Button
                                        disabled={busy}
                                        onClick={() => {
                                            if (
                                                window.confirm(
                                                    'Khôi phục dữ liệu quản trị về phiên bản này? Phiên bản hiện tại vẫn được giữ trong lịch sử. Lịch đăng server không bị thay đổi.'
                                                )
                                            )
                                                action(async () => {
                                                    await authRequest(
                                                        '/api/snapshots/' + s.id + '/restore',
                                                        {
                                                            method: 'POST',
                                                            body: JSON.stringify({ version })
                                                        }
                                                    );
                                                    await reloadWorkspace();
                                                });
                                        }}
                                    >
                                        Khôi phục
                                    </Button>
                                )}
                            </div>
                        ))}
                    </details>
                )}
            </Panel>
            {kind === 'data' && (
                <p className="info-note">
                    Dữ liệu tự nhập và lịch sử nội bộ. Thu thập số liệu, gửi chat, chạy RPA và các
                    mạng xã hội khác cần adapter tương ứng; tạo bản ghi không kích hoạt dịch vụ bên
                    ngoài.
                </p>
            )}
            {modal && (
                <Modal
                    title={
                        modal.type === 'user'
                            ? 'Tạo thành viên'
                            : modal.type === 'record'
                              ? 'Bản ghi chức năng'
                              : ['password', 'resetPassword'].includes(modal.type)
                                ? 'Đổi mật khẩu'
                                : 'Nhập dữ liệu trình duyệt'
                    }
                    onClose={() => setModal(null)}
                >
                    <div className="dialog-body">
                        {modal.type === 'user' ? (
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    action(() =>
                                        authRequest('/api/auth/users', {
                                            method: 'POST',
                                            body: JSON.stringify(account)
                                        })
                                    );
                                }}
                            >
                                {[
                                    ['name', 'Họ tên', 'text'],
                                    ['email', 'Email', 'email'],
                                    ['password', 'Mật khẩu ban đầu', 'password']
                                ].map(([k, l, t]) => (
                                    <label key={k}>
                                        {l}
                                        <input
                                            required
                                            type={t}
                                            minLength={k === 'password' ? 12 : 1}
                                            value={account[k]}
                                            onChange={(e) =>
                                                setAccount({ ...account, [k]: e.target.value })
                                            }
                                        />
                                    </label>
                                ))}
                                <label>
                                    Vai trò
                                    <select
                                        value={account.role}
                                        onChange={(e) =>
                                            setAccount({ ...account, role: e.target.value })
                                        }
                                    >
                                        {Object.entries(labels).map(([k, v]) => (
                                            <option key={k} value={k}>
                                                {v}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <Button disabled={busy} type="submit">
                                    Tạo tài khoản
                                </Button>
                            </form>
                        ) : modal.type === 'record' ? (
                            <>
                                <div className="form-grid">
                                    {[['name', 'Tên', 'text'], ...(fields[resource] || [])].map(
                                        ([key, label, type]) => (
                                            <label key={key}>
                                                {label}
                                                {Array.isArray(type) ? (
                                                    <select
                                                        disabled={
                                                            !['admin', 'manager'].includes(
                                                                user.role
                                                            ) || resource === 'socialAccounts'
                                                        }
                                                        value={JSON.parse(record)[key] || type[0]}
                                                        onChange={(e) =>
                                                            setRecord(
                                                                JSON.stringify({
                                                                    ...JSON.parse(record),
                                                                    [key]: e.target.value
                                                                })
                                                            )
                                                        }
                                                    >
                                                        {type.map((v) => (
                                                            <option key={v}>{v}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={type}
                                                        min={type === 'number' ? 0 : undefined}
                                                        disabled={
                                                            !['admin', 'manager'].includes(
                                                                user.role
                                                            ) || resource === 'socialAccounts'
                                                        }
                                                        value={JSON.parse(record)[key] ?? ''}
                                                        onChange={(e) =>
                                                            setRecord(
                                                                JSON.stringify({
                                                                    ...JSON.parse(record),
                                                                    [key]:
                                                                        type === 'number'
                                                                            ? Number(e.target.value)
                                                                            : e.target.value
                                                                })
                                                            )
                                                        }
                                                    />
                                                )}
                                            </label>
                                        )
                                    )}
                                </div>
                                {resource === 'media' && (
                                    <label>
                                        Ảnh JPG/PNG/WebP/GIF, tối đa 1 MB
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/gif"
                                            onChange={(e) => {
                                                const file = e.target.files[0];
                                                if (!file) return;
                                                if (
                                                    file.size > 1048576 ||
                                                    ![
                                                        'image/jpeg',
                                                        'image/png',
                                                        'image/webp',
                                                        'image/gif'
                                                    ].includes(file.type)
                                                ) {
                                                    setError('Ảnh không hợp lệ hoặc vượt 1 MB.');
                                                    return;
                                                }
                                                const reader = new FileReader();
                                                reader.onload = () =>
                                                    setRecord((current) =>
                                                        JSON.stringify({
                                                            ...JSON.parse(current),
                                                            image: reader.result
                                                        })
                                                    );
                                                reader.readAsDataURL(file);
                                            }}
                                        />
                                    </label>
                                )}
                                {JSON.parse(record).image && (
                                    <img
                                        src={JSON.parse(record).image}
                                        alt="Ảnh đính kèm"
                                        style={{ maxWidth: '100%', maxHeight: 220 }}
                                    />
                                )}
                                {['admin', 'manager'].includes(user.role) &&
                                    resource !== 'socialAccounts' && (
                                        <Button
                                            disabled={busy}
                                            onClick={() =>
                                                action(() => {
                                                    const parsed = JSON.parse(record);
                                                    delete parsed.recordVersion;
                                                    delete parsed.deletedAt;
                                                    return authRequest(
                                                        '/api/records/' +
                                                            resource +
                                                            (modal.row ? '/' + modal.row.id : ''),
                                                        {
                                                            method: modal.row ? 'PUT' : 'POST',
                                                            body: JSON.stringify({
                                                                record: parsed,
                                                                version: modal.row?.recordVersion
                                                            })
                                                        }
                                                    );
                                                })
                                            }
                                        >
                                            Lưu bản ghi
                                        </Button>
                                    )}
                                {modal.row &&
                                    ['admin', 'manager'].includes(user.role) &&
                                    resource !== 'socialAccounts' && (
                                        <Button
                                            kind="danger"
                                            disabled={busy}
                                            onClick={() => {
                                                if (
                                                    window.confirm(
                                                        'Xóa bản ghi này? Lịch sử vẫn được giữ lại.'
                                                    )
                                                )
                                                    action(() =>
                                                        authRequest(
                                                            '/api/records/' +
                                                                resource +
                                                                '/' +
                                                                modal.row.id,
                                                            {
                                                                method: 'DELETE',
                                                                body: JSON.stringify({
                                                                    version: modal.row.recordVersion
                                                                })
                                                            }
                                                        )
                                                    );
                                            }}
                                        >
                                            Xóa bản ghi
                                        </Button>
                                    )}
                            </>
                        ) : ['password', 'resetPassword'].includes(modal.type) ? (
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    action(async () => {
                                        await authRequest(
                                            modal.type === 'resetPassword'
                                                ? '/api/auth/users/' + modal.row.id + '/password'
                                                : '/api/auth/password',
                                            {
                                                method: 'POST',
                                                body: JSON.stringify(
                                                    modal.type === 'resetPassword'
                                                        ? {
                                                              password: password.password,
                                                              adminPassword:
                                                                  password.currentPassword
                                                          }
                                                        : password
                                                )
                                            }
                                        );
                                        if (modal.type === 'password' || modal.row.id === user.id) {
                                            notify('Đã đổi mật khẩu. Đăng nhập lại.');
                                            location.reload();
                                        } else
                                            notify(
                                                'Đã đặt lại mật khẩu và thu hồi phiên của thành viên.'
                                            );
                                    });
                                }}
                            >
                                <label>
                                    {modal.type === 'resetPassword'
                                        ? 'Mật khẩu quản trị viên hiện tại'
                                        : 'Mật khẩu hiện tại'}
                                    <input
                                        required
                                        type="password"
                                        autoComplete="current-password"
                                        value={password.currentPassword}
                                        onChange={(e) =>
                                            setPassword({
                                                ...password,
                                                currentPassword: e.target.value
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    Mật khẩu mới
                                    <input
                                        required
                                        minLength={12}
                                        maxLength={128}
                                        type="password"
                                        autoComplete="new-password"
                                        value={password.password}
                                        onChange={(e) =>
                                            setPassword({ ...password, password: e.target.value })
                                        }
                                    />
                                </label>
                                <Button type="submit" disabled={busy}>
                                    Đổi mật khẩu
                                </Button>
                            </form>
                        ) : (
                            <>
                                <p>
                                    Nhập các bản ghi cũ từ trình duyệt này. Bản ghi đã có trong
                                    PostgreSQL được giữ nguyên; dữ liệu cũ vẫn còn trong
                                    localStorage để đối chiếu.
                                </p>
                                <Button onClick={importLocal}>Xác nhận nhập vào database</Button>
                            </>
                        )}
                        {error && (
                            <p role="alert" className="form-error">
                                {error}
                            </p>
                        )}
                    </div>
                </Modal>
            )}
        </>
    );
}

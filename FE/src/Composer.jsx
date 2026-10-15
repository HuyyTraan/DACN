import React, { useEffect, useRef, useState } from 'react';
import {
    Bold,
    Underline,
    Smile,
    ImagePlus,
    Plus,
    Trash2,
    CalendarDays,
    Clock3,
    ChevronDown,
    Check,
    Send,
    MessageCircle
} from 'lucide-react';
import { useWorkspace } from './App.jsx';
import { Avatar, Button, Modal, Platform } from './components.jsx';
import { socialRequest } from './Social.jsx';
import {
    characterLimits as limits,
    zones,
    toPlan,
    activeFollowups,
    displayTime,
    utcTime
} from './publishing-model.mjs';

export default function Composer({ post, onClose }) {
    const {
        data,
        update,
        saving,
        social,
        socialLoading,
        socialError,
        navigate,
        refreshSocial,
        activeSocialAccountId,
        workspaceError,
        user
    } = useWorkspace();
    const accounts = social.accounts.filter((a) => a.status === 'connected' && a.canPublish);
    const initial =
        accounts.find(
            (a) => a.id === post?.accountId || (!post && a.id === activeSocialAccountId)
        ) ||
        (!post?.accountId && accounts[0]);
    const [form, setForm] = useState({
        name: '',
        content: '',
        platform: initial?.platform || 'Facebook',
        channels: [initial?.platform || 'Facebook'],
        status: 'Bản nháp',
        date: window.Omni.today,
        time: '09:00',
        timezone: 'Asia/Ho_Chi_Minh',
        campaign: '',
        engagement: 0,
        reach: 0,
        comments: [],
        repeat: 'Không lặp lại',
        repeatCount: 1,
        image: '',
        ...post,
        accountIds: post?.accountIds || (initial ? [initial.id] : [])
    });
    const selected = accounts.filter((a) => form.accountIds.includes(a.id));
    const approvedTarget = selected.find((a) => a.id === form.serverDeliveryAccountId);
    const canPublishApprovedDelivery =
        form.serverPlanId &&
        form.serverDeliveryId &&
        form.serverDeliveryStatus === 'queued' &&
        form.status === 'Đã lên lịch' &&
        approvedTarget;
    const [preview, setPreview] = useState(initial?.platform || form.platform);
    const [previewAccount, setPreviewAccount] = useState(initial?.id || '');
    const identity =
        selected.find((a) => a.id === previewAccount && a.platform === preview) ||
        selected.find((a) => a.platform === preview);
    const [error, setError] = useState('');
    const [dirty, setDirty] = useState(false);
    const [discard, setDiscard] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishAttempted, setPublishAttempted] = useState(false);
    const [server, setServer] = useState({ ready: false, workerEnabled: false, loading: true });
    const [outcomes, setOutcomes] = useState(post?.publishResults || []);
    const [serverSaving, setServerSaving] = useState(false);
    const [busyMedia, setBusyMedia] = useState(false);
    const [activeItem, setActiveItem] = useState(0);
    const editorRefs = useRef([]);
    const fileInput = useRef(null);
    const mediaTarget = useRef(0);
    const mounted = useRef(true);
    const requests = useRef(new Map());
    const planRequestId = useRef(crypto.randomUUID());
    const outcomeRef = useRef(outcomes);
    const hasSent =
        Boolean(post?.facebookPostId) || outcomes.length > 0 || post?.publishingReadOnly;
    const busy = publishing || saving || serverSaving || busyMedia;
    useEffect(() => {
        mounted.current = true;
        socialRequest('/api/publishing/status')
            .then((s) => {
                if (mounted.current) setServer({ ...s, loading: false });
            })
            .catch(() => {
                if (mounted.current)
                    setServer({ ready: false, workerEnabled: false, loading: false });
            });
        return () => {
            mounted.current = false;
        };
    }, []);
    function field(key, value) {
        setForm((f) => ({ ...f, [key]: value }));
        setDirty(true);
        setError('');
    }
    function changeItem(index, changes) {
        if (index === 0) {
            setForm((f) => ({ ...f, ...changes }));
        } else
            setForm((f) => ({
                ...f,
                comments: f.comments.map((c, i) =>
                    i === index - 1
                        ? {
                              ...c,
                              ...(changes.content !== undefined
                                  ? { text: changes.content }
                                  : changes)
                          }
                        : c
                )
            }));
        setDirty(true);
        setError('');
    }
    function close() {
        if (busy) return;
        if (dirty) setDiscard(true);
        else onClose();
    }
    function toggle(account) {
        const ids = form.accountIds.includes(account.id)
            ? form.accountIds.filter((id) => id !== account.id)
            : [...form.accountIds, account.id];
        const channels = [
            ...new Set(accounts.filter((a) => ids.includes(a.id)).map((a) => a.platform))
        ];
        setForm((f) => ({
            ...f,
            accountIds: ids,
            accountId: ids[0] || '',
            channels: channels.length ? channels : [preview],
            platform: channels[0] || preview
        }));
        setPreview(account.platform);
        setPreviewAccount(account.id);
        setDirty(true);
    }
    function insert(index, prefix, suffix = '') {
        const element = editorRefs.current[index];
        const content = index === 0 ? form.content : form.comments[index - 1].text;
        const start = element.selectionStart,
            end = element.selectionEnd;
        changeItem(index, {
            content:
                content.slice(0, start) +
                prefix +
                content.slice(start, end) +
                suffix +
                content.slice(end)
        });
        setTimeout(() => {
            element.focus();
            element.setSelectionRange(start + prefix.length, end + prefix.length);
        }, 0);
    }
    function media(event) {
        const file = event.target.files[0],
            target = mediaTarget.current;
        event.target.value = '';
        if (!file) return;
        if (
            !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) ||
            file.size > 1048576
        ) {
            setError('Ảnh JPG/PNG/WebP/GIF tối đa 1 MB.');
            return;
        }
        const reader = new FileReader();
        setBusyMedia(true);
        reader.onload = () => {
            if (mounted.current) {
                changeItem(target, { image: reader.result });
                setBusyMedia(false);
            }
        };
        reader.onerror = () => {
            if (mounted.current) {
                setError('Không thể đọc ảnh.');
                setBusyMedia(false);
            }
        };
        reader.readAsDataURL(file);
    }
    function valid(status) {
        if (!form.date || !form.time) {
            setError('Chọn ngày và giờ để lưu kế hoạch.');
            return false;
        }
        const normalized = {
            ...form,
            name: window.Omni.postTitle(form.name, form.content),
            comments: activeFollowups(form.comments),
            ...displayTime(utcTime(form.date, form.time, form.timezone), 'Asia/Ho_Chi_Minh'),
            status
        };
        const message = window.Omni.validatePost(normalized);
        if (message) {
            setError(message);
            return false;
        }
        return normalized;
    }
    async function save(status) {
        const normalized = valid(status);
        if (!normalized) return;
        if (
            user.role === 'editor' &&
            status === 'Chờ duyệt' &&
            Date.parse(utcTime(form.date, form.time, form.timezone)) < Date.now() + 60 * 60 * 1000
        ) {
            setError(
                'Không có thẩm quyền gửi duyệt bài đăng trong vòng 1 giờ tới. Hãy chọn giờ đăng cách hiện tại ít nhất 1 giờ để Admin/Manager có thời gian nhận thông báo.'
            );
            return;
        }
        if (server.loading) {
            setError('Đang kiểm tra nơi lưu kế hoạch.');
            return;
        }
        if (user.role === 'editor' && status === 'Chờ duyệt' && !server.ready) {
            setError('Cần kết nối PostgreSQL để gửi duyệt và thông báo Admin/Manager.');
            return;
        }
        if (!server.ready && workspaceError) {
            setError(
                server.error ||
                    'Chưa kết nối được PostgreSQL nên chưa thể lưu lịch. Kiểm tra DATABASE_URL trong BE/.env rồi khởi động lại backend.'
            );
            return;
        }
        if (server.ready) {
            setServerSaving(true);
            try {
                const result = await socialRequest(
                    form.serverPlanId
                        ? `/api/publishing/plans/${form.serverPlanId}`
                        : '/api/publishing/plans',
                    {
                        method: form.serverPlanId ? 'PUT' : 'POST',
                        body: JSON.stringify({
                            ...toPlan(
                                { ...form, name: normalized.name },
                                status === 'Đã lên lịch'
                                    ? 'scheduled'
                                    : status === 'Chờ duyệt'
                                      ? 'pending'
                                      : 'draft'
                            ),
                            id: form.serverPlanId || planRequestId.current
                        })
                    }
                );
                if (form.id && data.posts.some((p) => p.id === form.id)) {
                    const linked = {
                        ...normalized,
                        serverPlanId: result.id,
                        serverVersion: result.version,
                        timezone: 'Asia/Ho_Chi_Minh'
                    };
                    if (
                        !(await update(
                            {
                                ...data,
                                posts: data.posts.map((p) => (p.id === form.id ? linked : p))
                            },
                            'Đã lưu kế hoạch PostgreSQL'
                        ))
                    ) {
                        setError(
                            'Kế hoạch đã lưu trên server, nhưng chưa cập nhật được liên kết bản soạn. Tải lại để kiểm tra lịch trước khi tạo mới.'
                        );
                        window.dispatchEvent(new Event('publishing-plans-changed'));
                        return;
                    }
                }
                window.dispatchEvent(new Event('publishing-plans-changed'));
                onClose();
            } catch (e) {
                setError(e.message);
            } finally {
                setServerSaving(false);
            }
            return;
        }
        if (form.serverPlanId) {
            setError('Kế hoạch server chưa truy cập được. Kết nối lại DB trước khi lưu.');
            return;
        }
        const record = {
            ...normalized,
            id: form.id || crypto.randomUUID(),
            timezone: 'Asia/Ho_Chi_Minh',
            accountId: form.accountIds[0] || ''
        };
        if (
            await update(
                {
                    ...data,
                    posts: form.id
                        ? data.posts.map((p) => (p.id === form.id ? record : p))
                        : [...data.posts, record]
                },
                status === 'Đã lên lịch'
                    ? 'Đã lưu kế hoạch cục bộ · Chưa gửi vào hàng đợi server'
                    : 'Đã lưu bản soạn'
            )
        )
            onClose();
        else setError('Chưa lưu được. Kiểm tra kết nối workspace hoặc chọn lưu cục bộ.');
    }
    async function publish() {
        if (form.serverPlanId) {
            await publishScheduledDelivery();
            return;
        }
        const normalized = valid('Bản nháp');
        if (!normalized) return;
        if (!selected.length || selected.some((a) => a.platform !== 'Facebook')) {
            setError('Chỉ tài khoản Facebook đã xác minh có thể đăng ngay.');
            return;
        }
        if (activeFollowups(form.comments).length) {
            setError(
                'Chuỗi bài cần dùng lịch server. Reply hiện chỉ lưu nháp; xóa phần nối tiếp nếu chỉ muốn đăng bài chính ngay.'
            );
            return;
        }
        if (hasSent) return;
        setPublishing(true);
        setError('');
        const results = [];
        for (const account of selected) {
            const requestId = requests.current.get(account.id) || crypto.randomUUID();
            requests.current.set(account.id, requestId);
            try {
                const body = await socialRequest('/api/publish/facebook', {
                    method: 'POST',
                    body: JSON.stringify({
                        noiDungBaiViet: form.content,
                        image: form.image || undefined,
                        accountId: account.id,
                        requestId
                    })
                });
                results.push({
                    accountId: account.id,
                    accountName: account.name,
                    status: 'published',
                    facebookPostId: body.facebookPostId,
                    permalink: body.permalink
                });
            } catch (e) {
                results.push({
                    accountId: account.id,
                    accountName: account.name,
                    status: 'check-required',
                    error: e.message
                });
            }
            outcomeRef.current = [...results];
            setOutcomes([...results]);
        }
        setConfirm(false);
        await refreshSocial();
        const record = {
            ...form,
            name: normalized.name,
            comments: activeFollowups(form.comments),
            id: form.id || crypto.randomUUID(),
            status: results.every((r) => r.status === 'published') ? 'Đã đăng' : 'Cần kiểm tra',
            publishResults: results,
            facebookPostId: results.find((r) => r.facebookPostId)?.facebookPostId,
            accountId: selected[0].id,
            accountName: selected[0].name,
            accountAvatar: selected[0].avatar,
            ...displayTime(new Date().toISOString(), 'Asia/Ho_Chi_Minh'),
            timezone: 'Asia/Ho_Chi_Minh'
        };
        const stored = await update(
            {
                ...data,
                posts: form.id
                    ? data.posts.map((p) => (p.id === form.id ? record : p))
                    : [...data.posts, record]
            },
            'Đã nhận kết quả từng tài khoản'
        );
        setPublishing(false);
        setDirty(false);
        if (!stored)
            setError(
                'Đã gửi yêu cầu nhưng chưa lưu được kết quả vào workspace. Không đăng lại; kiểm tra Page trước.'
            );
    }
    async function publishScheduledDelivery() {
        if (!canPublishApprovedDelivery || dirty || publishAttempted) {
            setConfirm(false);
            setError(
                'Lượt đăng đã thay đổi hoặc nội dung chưa lưu. Tải lại kế hoạch trước khi đăng.'
            );
            return;
        }
        setPublishAttempted(true);
        setPublishing(true);
        setError('');
        try {
            const result = await socialRequest(
                `/api/publishing/plans/${form.serverPlanId}/deliveries/${form.serverDeliveryId}/publish-now`,
                {
                    method: 'POST',
                    body: JSON.stringify({ version: form.serverVersion })
                }
            );
            setConfirm(false);
            window.dispatchEvent(new Event('publishing-plans-changed'));
            setOutcomes([
                {
                    accountId: approvedTarget.id,
                    accountName: approvedTarget.name,
                    status: result.status === 'published' ? 'published' : 'check-required',
                    facebookPostId: result.providerPostId,
                    error:
                        result.status === 'unknown'
                            ? 'Chưa rõ Facebook đã nhận bài hay chưa'
                            : result.error || 'Chưa đăng được'
                }
            ]);
            if (result.status === 'published') {
                await refreshSocial().catch(() => {});
                onClose();
            } else {
                setError(
                    result.status === 'unknown'
                        ? 'Kết quả chưa rõ. Kiểm tra Facebook Page trước khi tạo lượt đăng mới.'
                        : 'Lượt đăng thất bại. Xem kết quả và tải lại lịch trước khi xử lý tiếp.'
                );
            }
        } catch (e) {
            setConfirm(false);
            window.dispatchEvent(new Event('publishing-plans-changed'));
            setError(
                `${e.message} Không bấm đăng lại trước khi kiểm tra Facebook Page và tải lại lịch.`
            );
        } finally {
            setPublishing(false);
        }
    }
    const items = [
        { content: form.content, image: form.image, kind: 'post' },
        ...form.comments.map((c) => ({ ...c, content: c.text }))
    ];
    return (
        <Modal
            wide
            className="publishing-composer-modal"
            title={
                form.id || form.serverPlanId
                    ? 'Chỉnh sửa kế hoạch nội dung'
                    : 'Tạo bài viết & chuỗi nội dung'
            }
            onClose={close}
        >
            {discard && (
                <div className="discard-prompt" role="alert">
                    <strong>Bản soạn chưa lưu.</strong>
                    <Button onClick={() => setDiscard(false)}>Tiếp tục soạn</Button>
                    <Button kind="danger" onClick={onClose}>
                        Bỏ thay đổi
                    </Button>
                </div>
            )}
            <div className="composer-layout studio-composer">
                <div className="composer-editor">
                    <fieldset disabled={busy || hasSent} className="studio-fields">
                        <div className="studio-channel-heading">
                            <span className="field-caption">TÀI KHOẢN ĐĂNG BÀI</span>
                            <span>{selected.length} đã chọn</span>
                        </div>
                        <div className="studio-accounts">
                            {accounts.map((a) => (
                                <button
                                    key={a.id}
                                    className={`studio-account ${form.accountIds.includes(a.id) ? 'selected' : ''}`}
                                    aria-pressed={form.accountIds.includes(a.id)}
                                    aria-label={`${a.name} · ${a.platform}`}
                                    title={`${a.name} · ${a.platform}`}
                                    onClick={() => toggle(a)}
                                >
                                    <Avatar name={a.name} src={a.avatar} size="small" />
                                    <span className="studio-account-badge">
                                        <Platform name={a.platform} small />
                                    </span>
                                    <span>
                                        {a.name}
                                        <small>
                                            <Platform name={a.platform} />
                                        </small>
                                    </span>
                                    {form.accountIds.includes(a.id) && <Check size={15} />}
                                </button>
                            ))}
                        </div>
                        {!!selected.length && (
                            <div className="studio-selected-accounts">
                                <span>Đang soạn cho</span>
                                {selected.map((a) => (
                                    <span key={a.id}>
                                        <Platform name={a.platform} small />
                                        {a.name}
                                    </span>
                                ))}
                            </div>
                        )}
                        {!accounts.length && (
                            <div className="composer-no-account">
                                <p>
                                    {socialLoading
                                        ? 'Đang kiểm tra kết nối…'
                                        : socialError ||
                                          'Chưa có tài khoản được xác minh. Có thể soạn nháp và xem trước.'}
                                </p>
                                <Button
                                    onClick={() => {
                                        if (dirty)
                                            setError(
                                                'Lưu nháp trước khi chuyển sang liên kết tài khoản.'
                                            );
                                        else {
                                            onClose();
                                            navigate('connections');
                                        }
                                    }}
                                >
                                    Liên kết tài khoản
                                </Button>
                            </div>
                        )}
                        <label className="post-title-label">
                            Tên kế hoạch (tùy chọn)
                            <input
                                autoFocus
                                maxLength={180}
                                value={form.name}
                                onChange={(e) => field('name', e.target.value)}
                                placeholder="Để trống để tự lấy tên từ nội dung bài viết"
                            />
                        </label>
                        <input
                            ref={fileInput}
                            type="file"
                            hidden
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={media}
                        />
                        <div className="studio-thread">
                            {items.map((item, index) => (
                                <section
                                    key={index}
                                    className={`studio-thread-item ${activeItem === index ? 'focused' : ''}`}
                                >
                                    <div className="studio-item-heading">
                                        <span className="studio-item-number">
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                        {index === 0 ? (
                                            <strong>Bài viết chính</strong>
                                        ) : (
                                            <select
                                                aria-label={`Loại nội dung ${index + 1}`}
                                                value={item.kind || 'reply'}
                                                onChange={(e) =>
                                                    changeItem(index, { kind: e.target.value })
                                                }
                                            >
                                                <option value="post">
                                                    Bài nối tiếp (tùy chọn)
                                                </option>
                                                <option value="reply">
                                                    Reply / bình luận (chỉ soạn)
                                                </option>
                                            </select>
                                        )}
                                    </div>
                                    <textarea
                                        ref={(el) => {
                                            editorRefs.current[index] = el;
                                        }}
                                        aria-label={
                                            index === 0
                                                ? 'Nội dung bài viết'
                                                : `Nội dung nối tiếp ${index}`
                                        }
                                        value={item.content}
                                        onFocus={() => setActiveItem(index)}
                                        onChange={(e) =>
                                            changeItem(index, { content: e.target.value })
                                        }
                                        placeholder={
                                            index === 0
                                                ? 'Chia sẻ câu chuyện của bạn…'
                                                : 'Không bắt buộc · Để trống nếu chỉ sửa bài chính…'
                                        }
                                    />
                                    {item.image && (
                                        <div className="attached-image">
                                            <img
                                                src={item.image}
                                                alt={`Ảnh nội dung ${index + 1}`}
                                            />
                                            <button
                                                className="icon-button"
                                                aria-label={`Xóa ảnh nội dung ${index + 1}`}
                                                onClick={() => changeItem(index, { image: '' })}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    )}
                                    <div className="editor-tools">
                                        <button
                                            aria-label={`Thêm ảnh nội dung ${index + 1}`}
                                            onClick={() => {
                                                mediaTarget.current = index;
                                                fileInput.current.click();
                                            }}
                                        >
                                            <ImagePlus size={16} />
                                            <span>Thêm ảnh</span>
                                        </button>
                                        <span className="tool-separator" />
                                        <button
                                            aria-label={`In đậm nội dung ${index + 1}`}
                                            title="Định dạng bản soạn (Markdown)"
                                            onClick={() => insert(index, '**', '**')}
                                        >
                                            <Bold size={16} />
                                        </button>
                                        <button
                                            aria-label={`Gạch chân nội dung ${index + 1}`}
                                            title="Định dạng bản soạn (Markdown)"
                                            onClick={() => insert(index, '__', '__')}
                                        >
                                            <Underline size={16} />
                                        </button>
                                        <button
                                            aria-label={`Emoji nội dung ${index + 1}`}
                                            onClick={() => insert(index, ' ✨')}
                                        >
                                            <Smile size={16} />
                                        </button>
                                        <details
                                            className={`character-count ${item.content.length > limits[preview] ? 'negative' : ''}`}
                                        >
                                            <summary>
                                                <Check size={13} />
                                                {item.content.length}/{limits[preview]}
                                                <ChevronDown size={12} />
                                            </summary>
                                            <div>
                                                {window.Omni.platforms.map((p) => (
                                                    <p key={p}>
                                                        <Platform name={p} />
                                                        <span
                                                            className={
                                                                item.content.length > limits[p]
                                                                    ? 'negative'
                                                                    : ''
                                                            }
                                                        >
                                                            {item.content.length}/{limits[p]}
                                                        </span>
                                                    </p>
                                                ))}
                                            </div>
                                        </details>
                                        {index > 0 && (
                                            <>
                                                <label className="studio-delay">
                                                    <Clock3 size={14} />
                                                    <select
                                                        aria-label={`Độ trễ nội dung ${index + 1}`}
                                                        value={item.delay}
                                                        onChange={(e) =>
                                                            changeItem(index, {
                                                                delay: e.target.value
                                                            })
                                                        }
                                                    >
                                                        {[
                                                            'Ngay sau đăng',
                                                            '1 giờ',
                                                            '2 giờ',
                                                            '3 giờ',
                                                            '4 giờ',
                                                            '5 giờ'
                                                        ].map((d) => (
                                                            <option key={d}>{d}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <button
                                                    className="danger-text"
                                                    aria-label={`Xóa nội dung ${index + 1}`}
                                                    onClick={() =>
                                                        field(
                                                            'comments',
                                                            form.comments.filter(
                                                                (_, i) => i !== index - 1
                                                            )
                                                        )
                                                    }
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </section>
                            ))}
                        </div>
                        <Button
                            icon={Plus}
                            disabled={form.comments.length >= 9}
                            onClick={() =>
                                field('comments', [
                                    ...form.comments,
                                    { text: '', kind: 'post', delay: '1 giờ', image: '' }
                                ])
                            }
                        >
                            Thêm nội dung nối tiếp
                        </Button>
                        <details className="studio-options">
                            <summary>
                                Cài đặt kế hoạch <ChevronDown size={15} />
                            </summary>
                            <div className="composer-settings">
                                <label>
                                    Chiến dịch
                                    <select
                                        value={form.campaign}
                                        onChange={(e) => field('campaign', e.target.value)}
                                    >
                                        <option value="">Chưa gắn chiến dịch</option>
                                        {data.campaigns.map((c) => (
                                            <option key={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Lặp lại
                                    <select
                                        value={form.repeat}
                                        onChange={(e) => field('repeat', e.target.value)}
                                    >
                                        <option>Không lặp lại</option>
                                        <option>Mỗi ngày</option>
                                        <option>Mỗi tuần</option>
                                    </select>
                                </label>
                                {form.repeat !== 'Không lặp lại' && (
                                    <label>
                                        Số lượt (tối đa 30)
                                        <input
                                            aria-label="Số lượt lặp"
                                            type="number"
                                            min={1}
                                            max={30}
                                            value={form.repeatCount}
                                            onChange={(e) => field('repeatCount', e.target.value)}
                                        />
                                    </label>
                                )}
                            </div>
                        </details>
                    </fieldset>
                    <p className="studio-storage-note">
                        {server.loading
                            ? 'Đang kiểm tra nơi lưu…'
                            : server.ready
                              ? `Lưu PostgreSQL · Worker ${server.workerEnabled ? 'đã bật cấu hình (cần chạy tiến trình)' : 'đang tắt'}`
                              : workspaceError
                                ? server.error || 'Chưa kết nối được nơi lưu kế hoạch'
                                : 'Lưu workspace · Lịch cục bộ chưa tự đăng'}
                        . Reply chỉ lưu bản soạn. Định dạng Markdown có thể không hiển thị trên nền
                        tảng.
                    </p>
                    {error && (
                        <p className="form-error" role="alert">
                            {error}
                        </p>
                    )}
                    {!!outcomes.length && (
                        <div className="studio-results" role="status">
                            {outcomes.map((r) => (
                                <p key={r.accountId}>
                                    <strong>{r.accountName}</strong>:{' '}
                                    {r.status === 'published'
                                        ? `Đã đăng · ${r.facebookPostId}`
                                        : `${r.error} · Kiểm tra Page trước khi đăng lại.`}
                                </p>
                            ))}
                        </div>
                    )}
                    {confirm && (
                        <div className="publish-confirm" role="alert">
                            <strong>
                                {form.serverPlanId
                                    ? `Đăng bài đã duyệt ngay lên ${approvedTarget?.name || 'Page đã chọn'}?`
                                    : `Đăng bài chính ngay lên ${selected.length} Page?`}
                            </strong>
                            <p>
                                {form.serverPlanId
                                    ? 'Lượt đăng của Page này sẽ được lưu kết quả và không chạy lại vào giờ hẹn.'
                                    : `${selected.map((a) => a.name).join(', ')}. Lịch/lặp lại không áp dụng cho thao tác này.`}
                            </p>
                            <Button disabled={publishing} onClick={() => setConfirm(false)}>
                                Hủy
                            </Button>
                            <Button
                                kind="danger"
                                disabled={
                                    publishing ||
                                    (form.serverPlanId
                                        ? !canPublishApprovedDelivery
                                        : !selected.length)
                                }
                                onClick={publish}
                            >
                                {publishing ? 'Đang gửi…' : 'Xác nhận đăng thật'}
                            </Button>
                        </div>
                    )}
                </div>
                <aside className="post-preview studio-preview">
                    <div className="preview-head">
                        <strong>Xem trước</strong>
                        <select
                            aria-label="Nền tảng xem trước"
                            value={preview}
                            onChange={(e) => setPreview(e.target.value)}
                        >
                            {window.Omni.platforms.map((p) => (
                                <option key={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                    {selected.filter((a) => a.platform === preview).length > 1 && (
                        <select
                            aria-label="Tài khoản xem trước"
                            value={identity?.id || ''}
                            onChange={(e) => setPreviewAccount(e.target.value)}
                        >
                            {selected
                                .filter((a) => a.platform === preview)
                                .map((a) => (
                                    <option value={a.id} key={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                        </select>
                    )}
                    <p className="studio-preview-note">
                        {identity
                            ? `Bản xem trước cho ${identity.name}`
                            : 'Mẫu hiển thị · Chưa có tài khoản kết nối cho nền tảng này'}
                    </p>
                    <article className={`social-preview preview-${preview.toLowerCase()}`}>
                        <div className="social-profile">
                            <Avatar
                                name={identity?.name || 'Chưa kết nối'}
                                src={identity?.avatar}
                            />
                            <div>
                                <strong>{identity?.name || 'Chưa chọn tài khoản'}</strong>
                                <small>
                                    <Platform name={preview} /> · Bản soạn
                                </small>
                            </div>
                        </div>
                        <div className="social-content">
                            <Formatted text={form.content || 'Nội dung sẽ xuất hiện ở đây…'} />
                        </div>
                        {form.image && (
                            <img
                                className="preview-media"
                                src={form.image}
                                alt="Xem trước ảnh bài chính"
                            />
                        )}
                        <div className="social-actions">
                            <span>
                                <Check size={15} /> Thích
                            </span>
                            <span>
                                <MessageCircle size={15} /> Bình luận
                            </span>
                            <span>
                                <Send size={15} /> Chia sẻ
                            </span>
                        </div>
                    </article>
                    {activeFollowups(form.comments).map((c, i) => (
                        <article className="studio-preview-followup" key={i}>
                            <Avatar
                                name={identity?.name || 'Chưa kết nối'}
                                src={identity?.avatar}
                                size="small"
                            />
                            <div>
                                <strong>{identity?.name || 'Nội dung nối tiếp'}</strong>
                                <small>
                                    {c.kind === 'post' ? 'Bài nối tiếp' : 'Reply · chỉ soạn'} ·{' '}
                                    {c.delay}
                                </small>
                                <p>
                                    <Formatted text={c.text || 'Nội dung tiếp theo…'} />
                                </p>
                                {c.image && (
                                    <img src={c.image} alt={`Xem trước ảnh nối tiếp ${i + 1}`} />
                                )}
                            </div>
                        </article>
                    ))}
                    <p className="preview-disclaimer">
                        Preview minh họa bố cục; giới hạn API và cách định dạng phụ thuộc nền tảng.
                        Chỉ Facebook có adapter đăng thật.
                    </p>
                </aside>
            </div>
            <div className="composer-footer">
                <fieldset disabled={busy || hasSent} className="schedule-fields">
                    <label>
                        <CalendarDays size={15} />
                        <input
                            aria-label="Ngày đăng"
                            type="date"
                            value={form.date}
                            onChange={(e) => field('date', e.target.value)}
                        />
                    </label>
                    <label>
                        <Clock3 size={15} />
                        <input
                            aria-label="Giờ đăng"
                            type="time"
                            value={form.time}
                            onChange={(e) => field('time', e.target.value)}
                        />
                    </label>
                    <select
                        aria-label="Múi giờ đăng"
                        value={form.timezone}
                        onChange={(e) => {
                            const instant = utcTime(form.date, form.time, form.timezone);
                            setForm((f) => ({
                                ...f,
                                ...displayTime(instant, e.target.value),
                                timezone: e.target.value
                            }));
                            setDirty(true);
                        }}
                    >
                        {Object.entries(zones).map(([z, o]) => (
                            <option key={z} value={z}>
                                GMT{o ? `+${o}` : ''}
                            </option>
                        ))}
                    </select>
                </fieldset>
                <div className="composer-buttons">
                    <Button
                        disabled={busy || hasSent || form.status === 'Đã hủy'}
                        onClick={() => save('Bản nháp')}
                    >
                        Lưu nháp
                    </Button>
                    <details className="publish-menu">
                        <summary className="button">
                            Tùy chọn <ChevronDown size={14} />
                        </summary>
                        <div>
                            {(form.serverPlanId || form.id) &&
                                form.status !== 'Đã hủy' &&
                                user.role !== 'editor' && (
                                    <button
                                        disabled={busy || hasSent}
                                        onClick={() => save('Đã lên lịch')}
                                    >
                                        Đổi lịch đăng
                                    </button>
                                )}
                            <button disabled={busy || hasSent} onClick={() => save('Chờ duyệt')}>
                                Gửi duyệt trong workspace
                            </button>
                            <button
                                disabled={
                                    busy ||
                                    !['admin', 'manager'].includes(user.role) ||
                                    (form.serverPlanId
                                        ? !canPublishApprovedDelivery ||
                                          publishAttempted ||
                                          !!outcomes.length
                                        : form.status === 'Đã hủy' ||
                                          hasSent ||
                                          !selected.length ||
                                          socialLoading ||
                                          !!activeFollowups(form.comments).length)
                                }
                                onClick={() => {
                                    if (form.serverPlanId && dirty) {
                                        setError(
                                            'Bạn có thay đổi chưa lưu. Bấm Lưu thay đổi, mở lại bài rồi mới đăng ngay.'
                                        );
                                        return;
                                    }
                                    setConfirm(true);
                                }}
                            >
                                Đăng ngay lên {form.serverPlanId ? 1 : selected.length} Page
                            </button>
                        </div>
                    </details>
                    <Button
                        icon={CalendarDays}
                        kind="primary"
                        disabled={busy || hasSent}
                        onClick={() =>
                            save(
                                form.status === 'Đã hủy' || user.role === 'editor'
                                    ? 'Chờ duyệt'
                                    : form.serverPlanId || form.id
                                      ? form.status
                                      : 'Đã lên lịch'
                            )
                        }
                    >
                        {busy
                            ? 'Đang xử lý…'
                            : form.status === 'Đã hủy'
                              ? 'Gửi lại lên workspace'
                              : user.role === 'editor'
                                ? 'Gửi duyệt trong workspace'
                                : form.serverPlanId || form.id
                                  ? 'Lưu thay đổi'
                                  : 'Lưu lịch đăng'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
function Formatted({ text }) {
    return text
        .split(/(\*\*[^*]+\*\*|__[^_]+__)/g)
        .map((part, i) =>
            part.startsWith('**') ? (
                <strong key={i}>{part.slice(2, -2)}</strong>
            ) : part.startsWith('__') ? (
                <u key={i}>{part.slice(2, -2)}</u>
            ) : (
                <React.Fragment key={i}>{part}</React.Fragment>
            )
        );
}

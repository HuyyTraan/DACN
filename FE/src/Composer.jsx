import React, { useRef, useState } from 'react';
import {
    Bold,
    CalendarDays,
    Check,
    ChevronDown,
    Clock3,
    Heart,
    ImagePlus,
    MessageCircle,
    Plus,
    Send,
    Smile,
    Trash2,
    Underline
} from 'lucide-react';
import { useWorkspace } from './App.jsx';
import { Avatar, Button, Modal, Platform, dateLabel } from './components.jsx';

const limits = {
    Facebook: 63206,
    Instagram: 2200,
    TikTok: 4000,
    Google: 1500,
    YouTube: 5000,
    Zalo: 2000
};
export default function Composer({ post, onClose }) {
    const { data, update, saving, notify } = useWorkspace();
    const [form, setForm] = useState({
        name: '',
        content: '',
        platform: 'Facebook',
        channels: ['Facebook'],
        status: 'Bản nháp',
        date: '2026-10-12',
        time: '09:00',
        campaign: '',
        engagement: 0,
        reach: 0,
        comments: [],
        repeat: 'Không lặp lại',
        image: '',
        ...post
    });
    const [preview, setPreview] = useState(form.channels[0]);
    const [error, setError] = useState('');
    const [publishing, setPublishing] = useState(false);
    const [confirmPublish, setConfirmPublish] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [publishedId, setPublishedId] = useState(null);
    const [dirty, setDirty] = useState(false);
    const textarea = useRef(null);
    const imageInput = useRef(null);
    function field(key, value) {
        setForm((f) => ({ ...f, [key]: value }));
        setDirty(true);
        setError('');
    }
    function close() {
        if (dirty) setConfirmDiscard(true);
        else onClose();
    }
    function toggle(channel) {
        const channels = form.channels.includes(channel)
            ? form.channels.filter((c) => c !== channel)
            : [...form.channels, channel];
        field('channels', channels);
        if (!channels.includes(preview)) setPreview(channels[0] || 'Facebook');
    }
    function insert(prefix, suffix = '') {
        const start = textarea.current.selectionStart;
        const end = textarea.current.selectionEnd;
        field(
            'content',
            form.content.slice(0, start) +
                prefix +
                form.content.slice(start, end) +
                suffix +
                form.content.slice(end)
        );
        setTimeout(() => {
            textarea.current.focus();
            textarea.current.setSelectionRange(start + prefix.length, end + prefix.length);
        }, 0);
    }
    async function media(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (
            !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) ||
            file.size > 1024 * 1024
        ) {
            setError('Chọn ảnh JPG, PNG, WebP hoặc GIF, tối đa 1 MB.');
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => field('image', reader.result);
        reader.onerror = () => setError('Không thể đọc ảnh. Hãy thử lại.');
        reader.readAsDataURL(file);
        e.target.value = '';
    }
    async function save(status) {
        const next = {
            ...form,
            platform: form.channels[0],
            status,
            id: form.id || crypto.randomUUID()
        };
        const validation = window.Omni.validatePost(next);
        if (validation) {
            setError(validation);
            return;
        }
        if (
            await update(
                {
                    ...data,
                    posts: form.id
                        ? data.posts.map((p) => (p.id === form.id ? next : p))
                        : [...data.posts, next]
                },
                status === 'Đã lên lịch'
                    ? 'Đã lưu lịch demo · Chưa có worker tự đăng'
                    : status === 'Chờ duyệt'
                      ? 'Đã chuyển bài sang chờ duyệt'
                      : 'Đã lưu bản nháp'
            )
        )
            onClose();
        else setError('Không thể lưu bài viết. Kiểm tra kết nối hoặc dung lượng bộ nhớ.');
    }
    async function publish() {
        const validation = window.Omni.validatePost({ ...form, status: 'Bản nháp' });
        if (validation) {
            setError(validation);
            return;
        }
        if (!form.channels.includes('Facebook')) {
            setError('Chọn Facebook để sử dụng API đăng thật.');
            return;
        }
        if (publishedId) return;
        setPublishing(true);
        setError('');
        try {
            const response = await fetch('/api/publish/facebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ noiDungBaiViet: form.content })
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || 'Không thể đăng bài.');
            setPublishedId(body.facebookPostId);
            setConfirmPublish(false);
            const record = {
                ...form,
                id: form.id || crypto.randomUUID(),
                channels: ['Facebook'],
                platform: 'Facebook',
                status: 'Đã đăng',
                facebookPostId: body.facebookPostId,
                date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
            };
            if (
                await update(
                    {
                        ...data,
                        posts: form.id
                            ? data.posts.map((p) => (p.id === form.id ? record : p))
                            : [...data.posts, record]
                    },
                    `Đã đăng Facebook · ${body.facebookPostId}`
                )
            )
                onClose();
            else
                setError(
                    `Facebook đã đăng thành công (ID: ${body.facebookPostId}), nhưng chưa lưu được vào không gian. Không đăng lại bài này.`
                );
        } catch (e) {
            setError(e.message);
        } finally {
            setPublishing(false);
        }
    }
    return (
        <Modal
            wide
            title={form.id ? 'Chỉnh sửa bài viết' : 'Tạo một câu chuyện mới'}
            onClose={close}
        >
            {confirmDiscard && (
                <div className="discard-prompt" role="alert">
                    <div>
                        <strong>Bạn có thay đổi chưa lưu.</strong>
                        <p>Tiếp tục soạn hoặc bỏ bản chỉnh sửa này?</p>
                    </div>
                    <Button onClick={() => setConfirmDiscard(false)}>Tiếp tục soạn</Button>
                    <Button kind="danger" onClick={onClose}>
                        Bỏ thay đổi
                    </Button>
                </div>
            )}
            <div className="composer-layout">
                <div className="composer-editor">
                    <div className="channel-picker">
                        <span className="field-caption">ĐĂNG LÊN CÁC KÊNH</span>
                        <div>
                            {window.Omni.platforms.map((channel) => (
                                <button
                                    key={channel}
                                    className={`channel-option ${form.channels.includes(channel) ? 'selected' : ''}`}
                                    aria-pressed={form.channels.includes(channel)}
                                    onClick={() => toggle(channel)}
                                >
                                    <Platform name={channel} />
                                    {form.channels.includes(channel) && (
                                        <span className="channel-check">
                                            <Check size={10} />
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                    <label className="post-title-label">
                        Tên bài viết
                        <input
                            autoFocus
                            value={form.name}
                            placeholder="Đặt tên cho ý tưởng của bạn…"
                            maxLength="180"
                            onChange={(e) => field('name', e.target.value)}
                        />
                    </label>
                    <div className="editor-box">
                        <textarea
                            ref={textarea}
                            aria-label="Nội dung bài viết"
                            placeholder="Một câu chuyện đáng chia sẻ bắt đầu từ đây…"
                            value={form.content}
                            onChange={(e) => field('content', e.target.value)}
                        />
                        {form.image && (
                            <div className="attached-image">
                                <img src={form.image} alt="Ảnh đính kèm" />
                                <button
                                    className="icon-button"
                                    aria-label="Xóa ảnh"
                                    onClick={() => field('image', '')}
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        )}
                        <div className="editor-tools">
                            <input
                                hidden
                                ref={imageInput}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                onChange={media}
                            />
                            <button onClick={() => imageInput.current.click()}>
                                <ImagePlus size={16} />
                                <span>Thêm ảnh</span>
                            </button>
                            <span className="tool-separator" />
                            <button
                                aria-label="In đậm đoạn được chọn"
                                title="In đậm (Markdown)"
                                onClick={() => insert('**', '**')}
                            >
                                <Bold size={16} />
                            </button>
                            <button
                                aria-label="Gạch chân đoạn được chọn"
                                title="Gạch chân (Markdown)"
                                onClick={() => insert('__', '__')}
                            >
                                <Underline size={16} />
                            </button>
                            <button aria-label="Thêm emoji" onClick={() => insert(' ✨')}>
                                <Smile size={16} />
                            </button>
                            <details className="character-count">
                                <summary>
                                    <Check size={14} />
                                    {form.content.length}/{limits[preview]}
                                    <ChevronDown size={13} />
                                </summary>
                                <div>
                                    {form.channels.map((c) => (
                                        <p key={c}>
                                            <Platform name={c} />
                                            <span
                                                className={
                                                    form.content.length > limits[c]
                                                        ? 'negative'
                                                        : ''
                                                }
                                            >
                                                {form.content.length}/{limits[c]}
                                            </span>
                                        </p>
                                    ))}
                                </div>
                            </details>
                        </div>
                    </div>
                    <div className="comments-header">
                        <span>
                            BÌNH LUẬN ĐẦU TIÊN <small>Demo · Lưu cùng nội dung</small>
                        </span>
                        <button
                            className="text-link"
                            onClick={() =>
                                field('comments', [...form.comments, { text: '', delay: '1 giờ' }])
                            }
                        >
                            <Plus size={14} />
                            Thêm
                        </button>
                    </div>
                    {form.comments.map((comment, i) => (
                        <div className="comment-editor" key={i}>
                            <textarea
                                aria-label={`Bình luận ${i + 1}`}
                                value={comment.text}
                                placeholder="Thêm hashtag hoặc lời bình luận đầu tiên…"
                                onChange={(e) =>
                                    field(
                                        'comments',
                                        form.comments.map((c, j) =>
                                            j === i ? { ...c, text: e.target.value } : c
                                        )
                                    )
                                }
                            />
                            <div>
                                <label>
                                    <Clock3 size={14} />
                                    <select
                                        aria-label={`Thời gian bình luận ${i + 1}`}
                                        value={comment.delay}
                                        onChange={(e) =>
                                            field(
                                                'comments',
                                                form.comments.map((c, j) =>
                                                    j === i ? { ...c, delay: e.target.value } : c
                                                )
                                            )
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
                                    className="icon-button danger-text"
                                    aria-label={`Xóa bình luận ${i + 1}`}
                                    onClick={() =>
                                        field(
                                            'comments',
                                            form.comments.filter((_, j) => i !== j)
                                        )
                                    }
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ))}
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
                            Lặp lại (cấu hình demo)
                            <select
                                value={form.repeat}
                                onChange={(e) => field('repeat', e.target.value)}
                            >
                                <option>Không lặp lại</option>
                                <option>Mỗi ngày</option>
                                <option>Mỗi tuần</option>
                            </select>
                        </label>
                    </div>
                    {error && (
                        <p role="alert" className="form-error">
                            {error}
                        </p>
                    )}
                    {confirmPublish && (
                        <div className="publish-confirm" role="alert">
                            <strong>Đăng thật lên Facebook Page đã cấu hình trên máy chủ?</strong>
                            <p>
                                Chỉ nội dung văn bản sẽ được gửi ngay. Ảnh, bình luận và các kênh
                                khác không được gửi.
                            </p>
                            <div>
                                <Button onClick={() => setConfirmPublish(false)}>Hủy</Button>
                                <Button disabled={publishing} kind="danger" onClick={publish}>
                                    {publishing ? 'Đang đăng…' : 'Xác nhận đăng Facebook'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
                <aside className="post-preview">
                    <div className="preview-head">
                        <strong>Xem trước bài viết</strong>
                        <select
                            value={preview}
                            aria-label="Kênh xem trước"
                            onChange={(e) => setPreview(e.target.value)}
                        >
                            {(form.channels.length ? form.channels : ['Facebook']).map((c) => (
                                <option key={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                    <article className="social-preview">
                        <div className="social-profile">
                            <span className="studio-avatar">
                                O
                                <span>
                                    <Platform name={preview} small />
                                </span>
                            </span>
                            <div>
                                <strong>Omni Studio</strong>
                                <small>
                                    {preview} ·{' '}
                                    {form.status === 'Đã lên lịch'
                                        ? `${dateLabel(form.date)} · ${form.time}`
                                        : 'Bản xem trước'}
                                </small>
                            </div>
                            <span className="social-more">···</span>
                        </div>
                        <div className="social-content">
                            <Formatted
                                text={
                                    form.content ||
                                    'Nội dung của bạn sẽ xuất hiện ở đây. Hãy kể một câu chuyện thật đẹp.'
                                }
                            />
                        </div>
                        {form.image ? (
                            <img
                                className="preview-media"
                                src={form.image}
                                alt="Xem trước ảnh đính kèm"
                            />
                        ) : (
                            <div className="preview-placeholder">
                                <div className="poster-brand">omni / stories</div>
                                <span className="poster-asterisk">✳</span>
                                <strong>
                                    small moments,
                                    <br />
                                    <i>meaningful</i>
                                    <br />
                                    connections.
                                </strong>
                                <span className="poster-foot">CREATE SOMETHING GOOD. ↗</span>
                            </div>
                        )}
                        <div className="social-reactions">
                            <span>
                                <span>♥</span> {form.engagement || '—'}
                            </span>
                            <span>{form.comments.length} bình luận</span>
                        </div>
                        <div className="social-actions">
                            <span>
                                <Heart size={15} />
                                Thích
                            </span>
                            <span>
                                <MessageCircle size={15} />
                                Bình luận
                            </span>
                            <span>
                                <Send size={15} />
                                Chia sẻ
                            </span>
                        </div>
                        {form.comments
                            .filter((c) => c.text.trim())
                            .map((c, i) => (
                                <div className="preview-comment" key={i}>
                                    <Avatar name="Omni Studio" size="small" />
                                    <div>
                                        <strong>Omni Studio</strong>
                                        <p>{c.text}</p>
                                        <small>{c.delay} sau khi đăng · demo</small>
                                    </div>
                                </div>
                            ))}
                    </article>
                    <p className="preview-disclaimer">
                        Ảnh mẫu chỉ để minh họa bố cục, không được đính kèm khi lưu hoặc đăng. Thêm
                        ảnh của bạn để thay thế.
                    </p>
                </aside>
            </div>
            <div className="composer-footer">
                <div className="schedule-fields">
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
                            aria-label="Giờ đăng UTC+7"
                            type="time"
                            value={form.time}
                            onChange={(e) => field('time', e.target.value)}
                        />
                    </label>
                    <span>UTC+7</span>
                </div>
                <div className="composer-buttons">
                    <Button
                        disabled={saving || publishing || Boolean(publishedId)}
                        onClick={() => save('Bản nháp')}
                    >
                        Lưu nháp
                    </Button>
                    <details className="publish-menu">
                        <summary className="button">
                            Tùy chọn
                            <ChevronDown size={14} />
                        </summary>
                        <div>
                            <button
                                disabled={saving || publishing || Boolean(publishedId)}
                                onClick={() => save('Chờ duyệt')}
                            >
                                Gửi duyệt
                            </button>
                            <button
                                disabled={saving || publishing || Boolean(publishedId)}
                                onClick={() => setConfirmPublish(true)}
                            >
                                Đăng Facebook thật
                            </button>
                        </div>
                    </details>
                    <Button
                        kind="primary"
                        icon={CalendarDays}
                        disabled={saving || publishing || Boolean(publishedId)}
                        onClick={() => save('Đã lên lịch')}
                    >
                        {saving ? 'Đang lưu…' : 'Lưu lịch đăng'}
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

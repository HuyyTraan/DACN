export const zones = { 'Asia/Ho_Chi_Minh': 7, 'Asia/Singapore': 8, UTC: 0 };
export const characterLimits = {
    Facebook: 63206,
    Instagram: 2200,
    LinkedIn: 3000,
    X: 280,
    TikTok: 4000,
    Google: 1500,
    YouTube: 5000,
    Zalo: 2000
};
export const publishingStates = [
    'Tất cả',
    'Chưa duyệt',
    'Đã duyệt chưa đăng',
    'Đã đăng',
    'Đã hủy',
    'Bản nháp',
    'Đang đăng',
    'Lỗi',
    'Cần kiểm tra'
];
export function planStatus(plan, delivery) {
    if (delivery?.status === 'published') return 'Đã đăng';
    if (delivery?.status === 'running') return 'Đang đăng';
    if (delivery?.status === 'unknown') return 'Cần kiểm tra';
    if (delivery?.status === 'failed') return 'Lỗi';
    if (plan.status === 'cancelled' || delivery?.status === 'cancelled') return 'Đã hủy';
    if (plan.status === 'pending') return 'Chưa duyệt';
    return plan.status === 'scheduled' ? 'Đã duyệt chưa đăng' : 'Bản nháp';
}
export function workspaceStatus(post) {
    if (
        ['Chờ duyệt', 'Đã lên lịch'].includes(post.status) &&
        post.date &&
        post.time &&
        !post.facebookPostId &&
        !post.publishResults?.length
    ) {
        const due = Date.parse(
            `${post.date}T${post.time}:00${{ 'Asia/Ho_Chi_Minh': '+07:00', 'Asia/Singapore': '+08:00', UTC: 'Z' }[post.timezone || 'Asia/Ho_Chi_Minh']}`
        );
        if (Number.isFinite(due) && due <= Date.now()) return 'Đã hủy';
    }
    if (post.facebookPostId || post.publishResults?.some((r) => r.status === 'published'))
        return post.status === 'Cần kiểm tra' ? 'Cần kiểm tra' : 'Đã đăng';
    return (
        { 'Chờ duyệt': 'Chưa duyệt', 'Đã lên lịch': 'Đã duyệt chưa đăng' }[post.status] ||
        post.status
    );
}
export function utcTime(date, time, zone) {
    return new Date(
        `${date}T${time}:00${zones[zone] === 0 ? 'Z' : `+0${zones[zone]}:00`}`
    ).toISOString();
}
export function displayTime(instant, zone) {
    const shifted = new Date(new Date(instant).getTime() + zones[zone] * 3600000).toISOString();
    return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}
export function mergePublishedEvents(events, posts, zone) {
    const remote = posts
        .filter((p) => Number.isFinite(Date.parse(p.createdTime)))
        .map((p) => ({
            id: p.id,
            calendarId: `platform:${p.accountId}:${p.id}`,
            providerPostId: p.id,
            accountIds: [p.accountId],
            accountName: p.accountName,
            accountAvatar: p.accountAvatar,
            content:
                p.message || (p.image ? 'Bài đăng có ảnh' : 'Bài viết không có nội dung văn bản'),
            name: p.message?.slice(0, 80) || 'Bài đã đăng',
            image: p.image,
            permalink: p.permalink,
            ...displayTime(p.createdTime, zone),
            status: 'Đã đăng',
            deliveryStatus: 'published',
            source: 'platform'
        }));
    const ids = new Set(remote.map((p) => p.providerPostId));
    return [
        ...events.filter((e) => {
            const references = [
                e.providerPostId,
                e.facebookPostId,
                ...(e.publishResults || [])
                    .filter((r) => r.status === 'published')
                    .map((r) => r.facebookPostId)
            ].filter(Boolean);
            return !references.length || !references.every((id) => ids.has(id));
        }),
        ...new Map(remote.map((e) => [e.calendarId, e])).values()
    ];
}
export function toPlan(form, status) {
    return {
        name: form.name,
        accountIds: form.accountIds || [],
        items: [
            { content: form.content, image: form.image || '', kind: 'post', delayMinutes: 0 },
            ...activeFollowups(form.comments).map((c) => ({
                content: c.text,
                image: c.image || '',
                kind: c.kind || 'reply',
                delayMinutes: c.delay === 'Ngay sau đăng' ? 0 : Number.parseInt(c.delay) * 60
            }))
        ],
        timezone: form.timezone || 'Asia/Ho_Chi_Minh',
        scheduledAt: utcTime(form.date, form.time, form.timezone || 'Asia/Ho_Chi_Minh'),
        repeat: { 'Không lặp lại': 'none', 'Mỗi ngày': 'daily', 'Mỗi tuần': 'weekly' }[form.repeat],
        repeatCount: Number(form.repeatCount || 1),
        status,
        ...(form.serverVersion ? { version: form.serverVersion } : {})
    };
}
export function activeFollowups(comments = []) {
    // Ignore unused slots, but keep image attachments so validation cannot discard them.
    return comments.filter((c) => c.text.trim() || c.image);
}
export function fromPlan(plan, accounts) {
    const first = plan.items[0],
        account = accounts.find((a) => plan.accountIds.includes(a.id));
    const fields = plan.scheduledAt
        ? displayTime(plan.scheduledAt, plan.timezone)
        : { date: window.Omni.today, time: '09:00' };
    return {
        name: plan.name,
        content: first.content,
        image: first.image,
        accountIds: plan.accountIds,
        accountId: account?.id || '',
        channels: [
            ...new Set(
                accounts.filter((a) => plan.accountIds.includes(a.id)).map((a) => a.platform)
            )
        ].length
            ? [
                  ...new Set(
                      accounts.filter((a) => plan.accountIds.includes(a.id)).map((a) => a.platform)
                  )
              ]
            : ['Facebook'],
        platform: account?.platform || 'Facebook',
        ...fields,
        timezone: plan.timezone,
        comments: plan.items.slice(1).map((i) => ({
            text: i.content,
            image: i.image,
            kind: i.kind,
            delay: i.delayMinutes ? `${i.delayMinutes / 60} giờ` : 'Ngay sau đăng'
        })),
        repeat: { none: 'Không lặp lại', daily: 'Mỗi ngày', weekly: 'Mỗi tuần' }[plan.repeat],
        repeatCount: plan.repeatCount,
        serverPlanId: plan.id,
        serverVersion: plan.version,
        status: {
            draft: 'Bản nháp',
            pending: 'Chờ duyệt',
            cancelled: 'Đã hủy',
            scheduled: 'Đã lên lịch'
        }[plan.status],
        cancellationReason: plan.cancellationReason || '',
        publishingReadOnly:
            plan.deliveries?.some((d) => ['running', 'published', 'unknown'].includes(d.status)) ||
            false
    };
}

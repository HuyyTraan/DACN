const { test } = require('node:test');
const assert = require('node:assert/strict');
test('calendar merges Page posts with local plans by provider ID and actual publication time', async () => {
    const { mergePublishedEvents } = await import('../src/publishing-model.mjs');
    const events = [
        { calendarId: 'local', facebookPostId: '123_1', status: 'Đã đăng' },
        {
            calendarId: 'delivery',
            providerPostId: '123_2',
            status: 'Đã đăng',
            source: 'server',
            plan: { id: 'plan-2', status: 'scheduled' }
        },
        { calendarId: 'pending', status: 'Chưa duyệt' }
    ];
    const posts = [
        {
            id: '123_1',
            accountId: 'facebook:123',
            message: 'Photo post',
            createdTime: '2026-10-12T12:25:57+0000',
            image: 'https://example.com/photo.jpg'
        },
        {
            id: '123_2',
            accountId: 'facebook:123',
            message: 'Second post',
            createdTime: '2026-10-12T08:13:34Z'
        },
        { id: 'invalid', createdTime: 'invalid' }
    ];
    const result = mergePublishedEvents(events, [...posts, posts[0]], 'Asia/Ho_Chi_Minh');
    assert.equal(result.length, 3);
    const first = result.find((e) => e.providerPostId === '123_1');
    assert.equal(first.date, '2026-10-12');
    assert.equal(first.time, '19:25');
    assert.equal(first.status, 'Đã đăng');
    assert.equal(first.source, 'platform');
    assert.equal(first.image, posts[0].image);
    assert.deepEqual(first.accountIds, ['facebook:123']);
    assert.equal(result.find((e) => e.providerPostId === '123_2').time, '15:13');
    assert.equal(result.find((e) => e.providerPostId === '123_2').plan.id, 'plan-2');
    assert.equal(result.filter((e) => e.status === 'Chưa duyệt').length, 1);
    assert.equal(
        mergePublishedEvents(
            [],
            [{ ...posts[0], createdTime: '2026-10-12T18:00:00Z' }],
            'Asia/Singapore'
        )[0].date,
        '2026-10-13'
    );
});
test('calendar distinguishes approval, cancellation and actual provider outcomes', async () => {
    const { planStatus, workspaceStatus, fromPlan } = await import('../src/publishing-model.mjs');
    assert.equal(planStatus({ status: 'pending' }), 'Chưa duyệt');
    assert.equal(planStatus({ status: 'scheduled' }, { status: 'queued' }), 'Đã duyệt chưa đăng');
    assert.equal(
        planStatus({ status: 'scheduled' }, { status: 'published', provider_post_id: 'page_post' }),
        'Đã đăng'
    );
    assert.equal(planStatus({ status: 'cancelled' }, { status: 'published' }), 'Đã đăng');
    assert.equal(planStatus({ status: 'cancelled' }, { status: 'cancelled' }), 'Đã hủy');
    assert.equal(planStatus({ status: 'scheduled' }, { status: 'unknown' }), 'Cần kiểm tra');
    assert.equal(workspaceStatus({ status: 'Chờ duyệt' }), 'Chưa duyệt');
    assert.equal(workspaceStatus({ status: 'Đã lên lịch' }), 'Đã duyệt chưa đăng');
    assert.equal(
        workspaceStatus({
            status: 'Đã lên lịch',
            date: '2020-01-01',
            time: '12:00',
            timezone: 'Asia/Ho_Chi_Minh'
        }),
        'Đã hủy'
    );
    assert.equal(
        workspaceStatus({
            status: 'Đã lên lịch',
            date: '2020-01-01',
            time: '12:00',
            facebookPostId: 'page_post'
        }),
        'Đã đăng'
    );
});
test('editing only the main post ignores unused followup slots without losing existing content or images', async () => {
    const { activeFollowups, toPlan } = await import('../src/publishing-model.mjs');
    const comments = [
        { text: '  ', kind: 'post', delay: '1 giờ' },
        { text: 'Bài tiếp đã có', kind: 'post', delay: '2 giờ' },
        { text: '', image: 'data:image/png;base64,AAAA', kind: 'post', delay: '1 giờ' }
    ];
    const original = structuredClone(comments);
    assert.deepEqual(activeFollowups(comments), comments.slice(1));
    const plan = toPlan(
        {
            name: 'Sửa bài chính',
            content: 'Nội dung mới',
            accountIds: ['facebook:1'],
            comments: comments.slice(0, 2),
            date: '2099-01-01',
            time: '09:00',
            timezone: 'Asia/Ho_Chi_Minh',
            repeat: 'Không lặp lại'
        },
        'draft'
    );
    assert.equal(plan.items.length, 2);
    assert.equal(plan.items[0].content, 'Nội dung mới');
    assert.equal(plan.items[1].content, 'Bài tiếp đã có');
    assert.deepEqual(comments, original);
});
test('calendar timezone changes preserve the publishing instant across midnight', async () => {
    const { utcTime, displayTime } = await import('../src/publishing-model.mjs');
    const instant = utcTime('2099-01-01', '00:30', 'Asia/Ho_Chi_Minh');
    assert.equal(instant, '2098-12-31T17:30:00.000Z');
    assert.deepEqual(displayTime(instant, 'UTC'), { date: '2098-12-31', time: '17:30' });
    assert.deepEqual(displayTime(instant, 'Asia/Singapore'), { date: '2099-01-01', time: '01:30' });
    assert.equal(
        utcTime(...Object.values(displayTime(instant, 'Asia/Singapore')), 'Asia/Singapore'),
        instant
    );
});
test('series plan round trip preserves targets, order, media and repeat configuration', async () => {
    const { toPlan, fromPlan } = await import('../src/publishing-model.mjs');
    const form = {
        name: 'Kế hoạch thật',
        content: 'Chính',
        image: '',
        accountIds: ['facebook:1', 'facebook:2'],
        date: '2099-01-01',
        time: '09:00',
        timezone: 'Asia/Ho_Chi_Minh',
        comments: [
            { text: 'Tiếp theo', kind: 'post', delay: '2 giờ', image: '' },
            { text: 'Reply', kind: 'reply', delay: 'Ngay sau đăng' }
        ],
        repeat: 'Mỗi tuần',
        repeatCount: 3,
        tag: 'Chiến dịch mùa hè'
    };
    const plan = toPlan(form, 'draft');
    const back = fromPlan({ ...plan, id: 'plan-id', version: 4 }, [
        { id: 'facebook:1', platform: 'Facebook' },
        { id: 'facebook:2', platform: 'Facebook' }
    ]);
    assert.deepEqual(back.accountIds, form.accountIds);
    assert.equal(back.comments[0].text, 'Tiếp theo');
    assert.equal(back.comments[1].kind, 'reply');
    assert.equal(back.time, '09:00');
    assert.equal(back.repeatCount, 3);
    assert.equal(plan.tag, 'Chiến dịch mùa hè');
    assert.equal(back.tag, form.tag);
    assert.equal(fromPlan({ ...plan, tag: undefined }, []).tag, '');
    assert.equal(back.serverVersion, 4);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../public/domain');

test('workspace schema rejects corrupted and duplicate records before rendering', () => {
    const state = domain.seed();
    assert.ok(domain.validWorkspace(state));
    const duplicate = structuredClone(state);
    duplicate.channels.push(duplicate.channels[0]);
    assert.equal(domain.validWorkspace(duplicate), false);
    const invalid = structuredClone(state);
    invalid.campaigns[0].budget = 'invalid';
    assert.equal(domain.validWorkspace(invalid), false);
    const invalidChat = structuredClone(state);
    invalidChat.conversations[0].messages = null;
    assert.equal(domain.validWorkspace(invalidChat), false);
});
test('loading local data reports corruption instead of discarding user changes', () => {
    assert.throws(() => domain.load({ getItem: () => '{}' }), /không hợp lệ/);
    assert.throws(() => domain.load({ getItem: () => 'not json' }));
    assert.equal(domain.load({ getItem: () => null }).posts.length, 6);
    let raw = '';
    const storage = {
        setItem: (key, value) => {
            raw = value;
        },
        getItem: () => raw
    };
    const state = domain.seed();
    state.posts[0].content = 'Nội dung đã thay đổi';
    domain.save(storage, state);
    assert.equal(domain.load(storage).posts[0].content, 'Nội dung đã thay đổi');
});
test('search combines platform/status and Vietnamese names', () => {
    assert.equal(
        domain.filterRows(domain.seed().accounts, 'linh', 'Facebook', 'Hoạt động').length,
        1
    );
    assert.equal(domain.filterRows(domain.seed().posts, '', 'TikTok', 'Đã đăng').length, 0);
    assert.deepEqual(
        domain
            .filterRows(domain.seed().posts, 'Một chút cảm hứng cho ngày mới', 'Facebook')
            .map((post) => post.id),
        ['post-1']
    );
});
test('CSV quotes commas, line breaks and neutralizes spreadsheet formulas', () => {
    const value = domain.csv(
        [{ name: '=HYPERLINK("x")', content: 'một,hai\nba' }],
        [
            { key: 'name', label: 'Tên' },
            { key: 'content', label: 'Nội dung' }
        ]
    );
    assert.ok(value.startsWith('\uFEFF'));
    assert.ok(value.includes('"\'=HYPERLINK(""x"")"'));
    assert.ok(value.includes('"một,hai\nba"'));
});
test('composer validates channels, limits and future scheduling', () => {
    const draft = { name: 'A', content: 'Nội dung', channels: ['Facebook'], status: 'Bản nháp' };
    assert.equal(domain.validatePost(draft), '');
    assert.match(domain.validatePost({ ...draft, content: ' ' }), /nội dung/);
    assert.match(domain.validatePost({ ...draft, channels: [] }), /kênh/);
    assert.match(
        domain.validatePost({ ...draft, channels: ['Instagram'], content: 'x'.repeat(2201) }),
        /giới hạn/
    );
    assert.match(
        domain.validatePost({ ...draft, status: 'Đã lên lịch', date: '2000-01-01', time: '12:00' }),
        /tương lai/
    );
    assert.equal(
        domain.validatePost({ ...draft, status: 'Đã lên lịch', date: '2099-01-01', time: '12:00' }),
        ''
    );
});

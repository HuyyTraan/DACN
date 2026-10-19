const test = require('node:test');
const assert = require('node:assert/strict');
const { readApprovalPage } = require('../server/automation');

test('RPA reads the pending approval dialog through UI controls only', async () => {
    const steps = [];
    const values = {
        'approval-plan-id': 'a70bf857-f646-49f3-a56d-d3595e5a3a27',
        'approval-plan-version': '4',
        'approval-name': 'Bài giới thiệu',
        'approval-creator': 'Biên tập viên',
        'approval-pages': 'Trang chính',
        'approval-scheduled-at': '20/10/2026 09:00'
    };
    const dialog = {
        waitFor: async () => steps.push('dialog'),
        getByTestId: (id) => ({
            innerText: async () => {
                steps.push(id);
                return values[id];
            },
            allInnerTexts: async () => {
                steps.push(id);
                return ['Nội dung bài'];
            }
        })
    };
    const page = {
        getByRole: (role, { name }) => {
            steps.push(`${role}:${name}`);
            if (role === 'dialog') return dialog;
            if (role === 'heading') return { waitFor: async () => {} };
            if (role === 'button' && name instanceof RegExp)
                return { first: () => ({ click: async () => steps.push('pending filter') }) };
            throw new Error('Unexpected UI control');
        },
        locator: (selector) => {
            steps.push(selector);
            return {
                waitFor: async () => {},
                getByRole: (role, { name }) => {
                    assert.equal(role, 'button');
                    assert.equal(name, 'Xem chi tiết');
                    return { click: async () => steps.push('detail click') };
                }
            };
        }
    };
    const result = await readApprovalPage(page, values['approval-plan-id'], 4, async (hash) =>
        steps.push(hash)
    );
    assert.equal(result.content, 'Nội dung bài');
    assert.equal(result.creator, 'Biên tập viên');
    assert.equal(result.planVersion, 4);
    assert.ok(Number.isFinite(Date.parse(result.readAt)));
    assert.ok(steps.indexOf('pending filter') < steps.indexOf('detail click'));
    assert.ok(steps.includes('posts/approvals/' + values['approval-plan-id']));
    assert.ok(!steps.some((step) => /Duyệt$|Từ chối|api\//.test(step)));
});

test('RPA rejects a dialog from another plan revision', async () => {
    const dialog = {
        waitFor: async () => {},
        getByTestId: (id) => ({
            innerText: async () =>
                id === 'approval-plan-id'
                    ? 'a70bf857-f646-49f3-a56d-d3595e5a3a27'
                    : id === 'approval-plan-version'
                      ? '2'
                      : 'value',
            allInnerTexts: async () => ['content']
        })
    };
    const page = {
        getByRole: (role) =>
            role === 'dialog'
                ? dialog
                : role === 'heading'
                  ? { waitFor: async () => {} }
                  : { first: () => ({ click: async () => {} }) },
        locator: () => ({
            waitFor: async () => {},
            getByRole: () => ({ click: async () => {} })
        })
    };
    await assert.rejects(
        readApprovalPage(page, 'a70bf857-f646-49f3-a56d-d3595e5a3a27', 3, async () => {}),
        /RPA_APPROVAL_MISMATCH/
    );
});

test('inactive n8n email template contains the UI reading and human review link', () => {
    const workflow = require('../workflows/post-approval-email.n8n.json');
    assert.equal(workflow.active, false);
    const email = workflow.nodes.find((node) => node.name === 'Send approval email').parameters;
    assert.equal(email.emailFormat, 'text');
    for (const field of [
        '$json.name',
        '$json.creator',
        '$json.content',
        '$json.pages',
        '$json.scheduled_at',
        '$json.read_at',
        '/#posts/approvals/'
    ])
        assert.ok(email.text.includes(field), field);
    assert.doesNotMatch(email.text, /password|cookie|access.token/i);
});

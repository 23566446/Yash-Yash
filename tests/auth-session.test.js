const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sessionScript = fs.readFileSync(require.resolve('../js/auth-session'), 'utf8');

function startSession(storage, fetch) {
    const redirects = [];
    const classNames = new Set(['auth-pending']);
    const window = {
        YashYashConfig: { API_URL: 'https://example.test' },
        location: { replace: path => redirects.push(path) },
        dispatchEvent() {}
    };
    const localStorage = {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
    };
    const document = {
        getElementById: () => null,
        body: { classList: { remove: name => classNames.delete(name) } }
    };
    vm.runInNewContext(sessionScript, { window, document, localStorage, fetch, CustomEvent: class {} });
    return { window, redirects, classNames };
}

test('missing token redirects without a session request', () => {
    const session = startSession(new Map([['yashyash_user', '{broken']]), () => { throw new Error('unexpected fetch'); });
    assert.deepEqual(session.redirects, ['login.html']);
});

test('valid token restores missing or malformed cached user from the server', async () => {
    for (const cachedUser of [undefined, '{broken']) {
        const storage = new Map([['yashyash_token', 'valid-token']]);
        if (cachedUser !== undefined) storage.set('yashyash_user', cachedUser);
        const calls = [];
        const session = startSession(storage, async (url, options) => {
            calls.push({ url, authorization: options.headers.Authorization });
            return { ok: true, status: 200, json: async () => ({ account: 'alice', role: 'user' }) };
        });
        const user = await session.window.YashYashSession.ready;
        assert.equal(user.account, 'alice');
        assert.equal(JSON.parse(storage.get('yashyash_user')).account, 'alice');
        assert.equal(session.classNames.has('auth-pending'), false);
        assert.deepEqual(calls, [{ url: 'https://example.test/api/session', authorization: 'Bearer valid-token' }]);
    }
});

test('expired token clears both local auth entries and redirects', async () => {
    const storage = new Map([['yashyash_token', 'expired'], ['yashyash_user', '{"account":"stale"}']]);
    const session = startSession(storage, async () => ({ ok: false, status: 401 }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(session.redirects, ['login.html']);
    assert.equal(storage.has('yashyash_token'), false);
    assert.equal(storage.has('yashyash_user'), false);
});

test('another tab in the same profile validates the shared token', async () => {
    const storage = new Map([['yashyash_token', 'shared-token']]);
    let requests = 0;
    const fetch = async () => {
        requests++;
        return { ok: true, status: 200, json: async () => ({ account: 'alice' }) };
    };
    const first = startSession(storage, fetch);
    const second = startSession(storage, fetch);
    await Promise.all([first.window.YashYashSession.ready, second.window.YashYashSession.ready]);
    assert.equal(requests, 2);
    assert.deepEqual(first.redirects, []);
    assert.deepEqual(second.redirects, []);
});

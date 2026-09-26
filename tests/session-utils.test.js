const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenVersionOf, isTokenVersionCurrent, sessionMetadata } = require('../lib/session-utils');

test('tokenVersionOf normalizes missing and invalid versions to zero', () => {
    assert.equal(tokenVersionOf(undefined), 0);
    assert.equal(tokenVersionOf(null), 0);
    assert.equal(tokenVersionOf(-1), 0);
    assert.equal(tokenVersionOf('2'), 2);
});

test('token version validation supports legacy version-zero tokens', () => {
    assert.equal(isTokenVersionCurrent({}, { tokenVersion: 0 }), true);
    assert.equal(isTokenVersionCurrent({ ver: 0 }, {}), true);
    assert.equal(isTokenVersionCurrent({ ver: 1 }, { tokenVersion: 1 }), true);
    assert.equal(isTokenVersionCurrent({ ver: 0 }, { tokenVersion: 1 }), false);
});

test('session metadata converts JWT timestamps to ISO strings', () => {
    assert.deepEqual(sessionMetadata({ iat: 1_700_000_000, exp: 1_700_604_800 }), {
        issuedAt: new Date(1_700_000_000 * 1000).toISOString(),
        expiresAt: new Date(1_700_604_800 * 1000).toISOString()
    });
    assert.deepEqual(sessionMetadata({}), { issuedAt: null, expiresAt: null });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { messageKey } = require('../js/chat-utils');

test('messageId controls realtime chat deduplication', () => {
    assert.equal(messageKey({ messageId: 'same' }), messageKey({ messageId: 'same', text: 'changed' }));
    assert.notEqual(messageKey({ messageId: 'one' }), messageKey({ messageId: 'two' }));
});

test('legacy identical messages have the same deterministic key', () => {
    const message = { time: '2026-01-01T00:00:00.000Z', sender: 'O\'Brien "Test"', text: '<img onerror=alert(1)>' };
    assert.equal(messageKey(message), messageKey({ ...message }));
    assert.match(messageKey(message), /^legacy:/);
});

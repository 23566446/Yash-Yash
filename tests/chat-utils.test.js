const test = require('node:test');
const assert = require('node:assert/strict');
const { messageKey, sortMessages } = require('../js/chat-utils');

test('messageId controls realtime chat deduplication', () => {
    assert.equal(messageKey({ messageId: 'same' }), messageKey({ messageId: 'same', text: 'changed' }));
    assert.notEqual(messageKey({ messageId: 'one' }), messageKey({ messageId: 'two' }));
});

test('legacy identical messages have the same deterministic key', () => {
    const message = { time: '2026-01-01T00:00:00.000Z', sender: 'O\'Brien "Test"', text: '<img onerror=alert(1)>' };
    assert.equal(messageKey(message), messageKey({ ...message }));
    assert.match(messageKey(message), /^legacy:/);
});

test('messages render chronologically regardless of arrival order', () => {
    const messages = [
        { messageId: 'm1', time: '2026-01-01T10:00:00Z' },
        { messageId: 'm3', time: '2026-01-01T10:02:00Z' },
        { messageId: 'm2', time: '2026-01-01T10:01:00Z' }
    ];
    assert.deepEqual(sortMessages(messages).map(message => message.messageId), ['m1', 'm2', 'm3']);
});

test('equal timestamps use the message key as a deterministic tie-breaker', () => {
    const messages = [
        { messageId: 'z', time: '2026-01-01T10:00:00Z' },
        { messageId: 'a', time: '2026-01-01T10:00:00Z' }
    ];
    assert.deepEqual(sortMessages(messages).map(message => message.messageId), ['a', 'z']);
});

test('invalid or missing timestamps sort safely and deterministically', () => {
    const messages = [
        { messageId: 'z', time: 'invalid' },
        { messageId: 'valid', time: '2026-01-01T10:00:00Z' },
        { messageId: 'a' }
    ];
    assert.doesNotThrow(() => sortMessages(messages));
    assert.deepEqual(sortMessages(messages).map(message => message.messageId), ['valid', 'a', 'z']);
});

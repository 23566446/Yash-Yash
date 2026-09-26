const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_LOCATIONS, MAX_TEXT_LENGTH, buildTripContext } = require('../lib/ai-context');
const { validateQuestion, createRateWindow } = require('../lib/ai-utils');
const { classifyProviderError } = require('../lib/ai-provider');

test('AI context keeps expense currencies separate', () => {
    const context = buildTripContext({}, [
        { amount: 100, currency: 'TWD' },
        { amount: 50, currency: 'TWD' },
        { amount: 1000, currency: 'JPY' },
        { amount: 4, currency: '' }
    ]);
    assert.deepEqual(context.expenseSummary, [
        { currency: 'JPY', totalAmount: 1000, expenseCount: 1 },
        { currency: 'TWD', totalAmount: 150, expenseCount: 2 },
        { currency: 'UNKNOWN', totalAmount: 4, expenseCount: 1 }
    ]);
});

test('AI context is bounded and excludes chat, photos, and secrets', () => {
    const locations = Array.from({ length: MAX_LOCATIONS + 10 }, (_, index) => ({ name: `Place ${index}`, note: 'x'.repeat(MAX_TEXT_LENGTH + 20) }));
    const context = buildTripContext({ title: 'Trip', participants: ['a'], days: [{ dayNumber: 1, locations }], chatMessages: ['secret'], imageData: 'secret', password: 'secret' }, []);
    assert.equal(context.days[0].locations.length, MAX_LOCATIONS);
    assert.equal(context.days[0].locations[0].note.length, MAX_TEXT_LENGTH);
    const serialized = JSON.stringify(context);
    assert.doesNotMatch(serialized, /chatMessages|imageData|password|secret/);
});

test('AI question validation preserves exact non-empty text', () => {
    assert.equal(validateQuestion('   ').ok, false);
    assert.equal(validateQuestion('x'.repeat(1001)).ok, false);
    assert.deepEqual(validateQuestion('  question  '), { ok: true, value: '  question  ' });
});

test('AI rate window limits authenticated account requests and expires entries', () => {
    let time = 1000;
    const limiter = createRateWindow({ limit: 2, windowMs: 100, now: () => time });
    assert.equal(limiter.allow('alice'), true);
    assert.equal(limiter.allow('alice'), true);
    assert.equal(limiter.allow('alice'), false);
    assert.equal(limiter.allow('bob'), true);
    time += 101;
    assert.equal(limiter.allow('alice'), true);
});

test('AI provider errors map to controlled diagnostic categories', () => {
    assert.equal(classifyProviderError({ status: 401, code: 'invalid_api_key' }).category, 'AI_AUTH_ERROR');
    assert.equal(classifyProviderError({ status: 429, code: 'insufficient_quota' }).category, 'AI_BILLING_ERROR');
    assert.equal(classifyProviderError({ status: 429, code: 'rate_limit_exceeded' }).category, 'AI_RATE_LIMIT');
    assert.equal(classifyProviderError({ status: 404, code: 'model_not_found' }).category, 'AI_MODEL_ERROR');
    assert.equal(classifyProviderError({ status: 500 }).category, 'AI_PROVIDER_FAILURE');
});

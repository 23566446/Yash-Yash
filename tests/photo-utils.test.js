const test = require('node:test');
const assert = require('node:assert/strict');
const { runBounded, isDataUrlWithinLimit, MAX_DATA_URL_LENGTH } = require('../js/photo-utils');

test('bounded runner processes every input with at most three active tasks', async () => {
    let active = 0;
    let maximum = 0;
    const inputs = [1, 2, 3, 4, 5, 6, 7];
    const results = await runBounded(inputs, async value => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise(resolve => setTimeout(resolve, 2));
        active--;
        return value * 2;
    }, 3);
    assert.equal(maximum, 3);
    assert.deepEqual(results.map(result => result.value), [2, 4, 6, 8, 10, 12, 14]);
});

test('one rejection does not cancel other tasks and result order is stable', async () => {
    const results = await runBounded(['first', 'bad', 'last'], async value => {
        if (value === 'bad') throw new Error('failed');
        return value;
    }, 2);
    assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected', 'fulfilled']);
    assert.equal(results[0].value, 'first');
    assert.equal(results[2].value, 'last');
});

test('data URL size helper enforces the backend safety margin', () => {
    assert.equal(isDataUrlWithinLimit('x'.repeat(MAX_DATA_URL_LENGTH)), true);
    assert.equal(isDataUrlWithinLimit('x'.repeat(MAX_DATA_URL_LENGTH + 1)), false);
    assert.equal(isDataUrlWithinLimit(null), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBounded, nextPhotoBaseOrder, isDataUrlWithinLimit, MAX_DATA_URL_LENGTH } = require('../js/photo-utils');

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

test('next photo order starts at zero and follows valid same-day orders', () => {
    assert.equal(nextPhotoBaseOrder([], 2), 0);
    assert.equal(nextPhotoBaseOrder([
        { dayIndex: 2, order: 0 },
        { dayIndex: 2, order: 1 },
        { dayIndex: 2, order: 2 }
    ], 2), 3);
    assert.equal(nextPhotoBaseOrder([{ dayIndex: 2, order: 999 }], 2), 1000);
});

test('next photo order ignores other days and malformed or negative orders', () => {
    assert.equal(nextPhotoBaseOrder([
        { dayIndex: 1, order: 50 },
        { dayIndex: 2, order: -1 },
        { dayIndex: 2, order: 3.5 },
        { dayIndex: 2, order: '8' },
        { dayIndex: 2 },
        null
    ], 2), 0);
});

test('bounded upload order remains associated with original file index', async () => {
    const files = ['slow', 'fast', 'medium'];
    const baseOrder = 4;
    const results = await runBounded(files, async (file, index) => {
        const delay = { slow: 8, fast: 1, medium: 4 }[file];
        await new Promise(resolve => setTimeout(resolve, delay));
        return { file, order: baseOrder + index };
    }, 3);
    assert.deepEqual(results.map(result => result.value), [
        { file: 'slow', order: 4 },
        { file: 'fast', order: 5 },
        { file: 'medium', order: 6 }
    ]);
});

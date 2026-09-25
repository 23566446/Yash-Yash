const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSettlements } = require('../js/settlement');

const total = transfers => transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('settles two people', () => {
    const result = calculateSettlements(new Map([['Alice', 150], ['Bob', -150]]));
    assert.deepEqual(result, [{ from: 'Bob', to: 'Alice', amount: 150 }]);
    closeTo(total(result), 150);
});

test('settles three people without near-zero transfers', () => {
    const result = calculateSettlements(new Map([['Alice', 800], ['Bob', -400], ['Charlie', -400]]));
    closeTo(total(result), 800);
    assert.ok(result.every(transfer => transfer.amount > 0.1));
});

test('multiple creditors and debtors are deterministic and conserved', () => {
    const balances = new Map([['Dora', -30], ['Bob', -70], ['Carol', 40], ['Alice', 60]]);
    const first = calculateSettlements(balances);
    const second = calculateSettlements(balances);
    assert.deepEqual(first, second);
    closeTo(total(first), 100);
});

test('currency buckets remain isolated', () => {
    const twd = calculateSettlements(new Map([['alice', 150], ['bob', -150]]));
    const usd = calculateSettlements(new Map([['alice', -50], ['bob', 50]]));
    assert.deepEqual(twd, [{ from: 'bob', to: 'alice', amount: 150 }]);
    assert.deepEqual(usd, [{ from: 'alice', to: 'bob', amount: 50 }]);
});

test('UNKNOWN and special account keys are Map-safe', () => {
    const unknown = calculateSettlements(new Map([['__proto__', 60], ['constructor', -40], ['toString', -20]]));
    assert.deepEqual(unknown, [
        { from: 'constructor', to: '__proto__', amount: 40 },
        { from: 'toString', to: '__proto__', amount: 20 }
    ]);
    closeTo(total(unknown), 60);
});

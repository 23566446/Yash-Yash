const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldNotifyProposalPending } = require('../lib/notification-utils');

test('notifies when voting first reaches pending', () => {
    assert.equal(shouldNotifyProposalPending('voting', 'pending'), true);
});

test('does not notify for later pending votes', () => {
    assert.equal(shouldNotifyProposalPending('pending', 'pending'), false);
});

test('does not notify below the threshold', () => {
    assert.equal(shouldNotifyProposalPending('voting', 'voting'), false);
});

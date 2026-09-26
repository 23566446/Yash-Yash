const test = require('node:test');
const assert = require('node:assert/strict');
const { sortUpcomingTrips } = require('../js/trip-order');

test('ongoing trips precede future trips and end sooner first', () => {
    const trips = [
        { _id: 'future', startDate: '2026-10-01', endDate: '2026-10-04' },
        { _id: 'long', startDate: '2026-09-20', endDate: '2026-09-30' },
        { _id: 'soon', startDate: '2026-09-22', endDate: '2026-09-27' }
    ];
    assert.deepEqual(sortUpcomingTrips(trips, '2026-09-26').map(t => t._id), ['soon', 'long', 'future']);
});

test('future trips sort by start date with deterministic ties', () => {
    const trips = [
        { _id: 'b', startDate: '2026-10-03', endDate: '2026-10-06' },
        { _id: 'later', startDate: '2026-11-01', endDate: '2026-11-03' },
        { _id: 'a', startDate: '2026-10-03', endDate: '2026-10-06' },
        { _id: 'nearest', startDate: '2026-09-27', endDate: '2026-09-29' }
    ];
    assert.deepEqual(sortUpcomingTrips(trips, '2026-09-26').map(t => t._id), ['nearest', 'a', 'b', 'later']);
});

test('ended trips are excluded without mutating the input', () => {
    const trips = [
        { _id: 'future', startDate: '2026-09-28', endDate: '2026-09-30' },
        { _id: 'ended', startDate: '2026-09-20', endDate: '2026-09-25' }
    ];
    assert.deepEqual(sortUpcomingTrips(trips, '2026-09-26').map(t => t._id), ['future']);
    assert.deepEqual(trips.map(t => t._id), ['future', 'ended']);
});

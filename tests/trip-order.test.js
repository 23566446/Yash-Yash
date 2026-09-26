const test = require('node:test');
const assert = require('node:assert/strict');
const { sortUpcomingTrips, localDateKey, daysUntilDate, tripDayLabel } = require('../js/trip-order');

test('planner day labels preserve calendar dates and weekdays across boundaries', () => {
    assert.equal(tripDayLabel('2026-09-26', 0), '9月26日 星期六');
    assert.equal(tripDayLabel('2026-09-30', 1), '10月1日 星期四');
    assert.equal(tripDayLabel('2026-12-31', 1, false), '1月1日');
    assert.equal(tripDayLabel('2028-02-28', 1), '2月29日 星期二');
});

test('local date key uses calendar fields at 00:30', () => {
    assert.equal(localDateKey(new Date(2026, 8, 26, 0, 30)), '2026-09-26');
});

test('days until date handles same, next, and previous days', () => {
    const now = new Date(2026, 8, 26, 0, 30);
    assert.equal(daysUntilDate('2026-09-26', now), 0);
    assert.equal(daysUntilDate('2026-09-27', now), 1);
    assert.equal(daysUntilDate('2026-09-25', now), -1);
});

test('days until date handles month and year boundaries', () => {
    assert.equal(daysUntilDate('2026-10-01', new Date(2026, 8, 30, 23, 30)), 1);
    assert.equal(daysUntilDate('2027-01-01', new Date(2026, 11, 31, 23, 30)), 1);
});

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

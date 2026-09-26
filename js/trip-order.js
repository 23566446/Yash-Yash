(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.YashYashTripOrder = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    function sortUpcomingTrips(trips, today) {
        return trips.filter(trip => trip.endDate >= today).sort((a, b) => {
            const aOngoing = a.startDate <= today;
            const bOngoing = b.startDate <= today;
            if (aOngoing !== bOngoing) return aOngoing ? -1 : 1;
            const firstDate = aOngoing ? 'endDate' : 'startDate';
            return String(a[firstDate]).localeCompare(String(b[firstDate]))
                || String(a.startDate).localeCompare(String(b.startDate))
                || String(a.endDate).localeCompare(String(b.endDate))
                || String(a._id ?? '').localeCompare(String(b._id ?? ''));
        });
    }

    return { sortUpcomingTrips };
}));

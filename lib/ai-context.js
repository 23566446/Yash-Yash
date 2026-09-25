const MAX_LOCATIONS = 80;
const MAX_RECENT_EXPENSES = 20;
const MAX_TEXT_LENGTH = 300;

function boundedText(value, maxLength = MAX_TEXT_LENGTH) {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function normalizedCurrency(value) {
    return typeof value === 'string' && value.trim() ? value.trim().toUpperCase().slice(0, 10) : 'UNKNOWN';
}

function buildTripContext(trip, expenses = []) {
    let remainingLocations = MAX_LOCATIONS;
    const days = (Array.isArray(trip?.days) ? trip.days : []).map(day => {
        const locations = (Array.isArray(day?.locations) ? day.locations : []).slice(0, remainingLocations).map(location => ({
            name: boundedText(location?.name),
            address: boundedText(location?.addr),
            note: boundedText(location?.note),
            time: boundedText(location?.time, 50)
        }));
        remainingLocations -= locations.length;
        return { dayNumber: Number(day?.dayNumber) || null, locations };
    });

    const summaries = new Map();
    expenses.forEach(expense => {
        const currency = normalizedCurrency(expense?.currency);
        const current = summaries.get(currency) || { currency, totalAmount: 0, expenseCount: 0 };
        const amount = Number(expense?.amount);
        if (Number.isFinite(amount)) current.totalAmount += amount;
        current.expenseCount++;
        summaries.set(currency, current);
    });

    const recentExpenses = expenses.slice(0, MAX_RECENT_EXPENSES).map(expense => ({
        amount: Number.isFinite(Number(expense?.amount)) ? Number(expense.amount) : null,
        currency: normalizedCurrency(expense?.currency),
        category: boundedText(expense?.category, 80),
        payer: boundedText(expense?.payerName || expense?.payer, 100),
        note: boundedText(expense?.note)
    }));

    return {
        title: boundedText(trip?.title, 150),
        startDate: boundedText(trip?.startDate, 30),
        endDate: boundedText(trip?.endDate, 30),
        participantCount: Array.isArray(trip?.participants) ? trip.participants.length : 0,
        days,
        expenseSummary: [...summaries.values()].sort((a, b) => a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0),
        recentExpenses
    };
}

module.exports = { MAX_LOCATIONS, MAX_RECENT_EXPENSES, MAX_TEXT_LENGTH, boundedText, normalizedCurrency, buildTripContext };

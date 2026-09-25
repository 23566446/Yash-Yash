(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.YashYashSettlement = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function calculateSettlements(balances, tolerance = 0.1) {
        const creditors = [];
        const debtors = [];
        for (const [account, rawBalance] of balances) {
            const balance = Number(rawBalance);
            if (!Number.isFinite(balance)) continue;
            if (balance > tolerance) creditors.push({ account, amount: balance });
            else if (balance < -tolerance) debtors.push({ account, amount: -balance });
        }
        creditors.sort((a, b) => String(a.account).localeCompare(String(b.account)));
        debtors.sort((a, b) => String(a.account).localeCompare(String(b.account)));
        const transfers = [];
        let creditorIndex = 0;
        let debtorIndex = 0;
        while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
            const creditor = creditors[creditorIndex];
            const debtor = debtors[debtorIndex];
            const amount = Math.min(creditor.amount, debtor.amount);
            if (amount > tolerance) transfers.push({ from: debtor.account, to: creditor.account, amount });
            creditor.amount -= amount;
            debtor.amount -= amount;
            if (creditor.amount <= tolerance) creditorIndex++;
            if (debtor.amount <= tolerance) debtorIndex++;
        }
        return transfers;
    }
    return { calculateSettlements };
}));

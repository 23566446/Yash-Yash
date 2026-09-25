const API_URL = window.YashYashConfig.API_URL;
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
if (!localStorage.getItem('yashyash_user') || !localStorage.getItem('yashyash_token')) { localStorage.removeItem('yashyash_user'); localStorage.removeItem('yashyash_token'); window.location.href = 'login.html'; }
const currentUser = JSON.parse(localStorage.getItem('yashyash_user'));

let tripParticipants = []; // 行程成員
let selectedSplit = [];    // 目前選中要分攤的人
function denyAccess() { alert('你沒有權限存取這個內容'); window.location.href = 'index.html'; }

window.onload = async () => {
    await fetchTripInfo();
    await fetchExpenses();
};

async function fetchTripInfo() {
    const res = await apiFetch(`${API_URL}/api/trips/${tripId}`);
    if (res.status === 403) return denyAccess();
    if (!res.ok) return alert('載入行程失敗');
    const trip = await res.json().catch(() => null);
    tripParticipants = Array.isArray(trip?.participants) ? trip.participants : [];
    renderSplitList();
}

function renderSplitList() {
    const container = document.getElementById('participant-split-list');
    // 預設全選
    selectedSplit = [...tripParticipants];

    const splitItems = tripParticipants.map(acc => {
        const item = document.createElement('div');
        item.className = 'split-item active';
        item.textContent = acc === currentUser.account ? '我' : acc;
        item.addEventListener('click', () => toggleSplit(acc, item));
        return item;
    });
    container.replaceChildren(...splitItems);
}

function toggleSplit(acc, element) {
    if (selectedSplit.includes(acc)) {
        selectedSplit = selectedSplit.filter(a => a !== acc);
        element.classList.remove('active');
    } else {
        selectedSplit.push(acc);
        element.classList.add('active');
    }
}

function showAddModal() { document.getElementById('add-modal').classList.remove('hidden'); }
function closeAddModal() {
    // 1. 隱藏 Modal
    const modal = document.getElementById('add-modal');
    modal.classList.add('hidden');
    
    // 2. 清空輸入框防止下次開啟殘留資料
    document.getElementById('exp-amount').value = "";
    document.getElementById('exp-note').value = "";
}

// 點擊背景也可關閉 (UX 優化)
document.getElementById('add-modal').addEventListener('click', function(e) {
    if (e.target === this) closeAddModal();
});

async function submitExpense() {
    const amount = document.getElementById('exp-amount').value;
    const currency = document.getElementById('exp-currency').value;
    const category = document.getElementById('exp-category').value;
    const note = document.getElementById('exp-note').value;

    if (!amount || selectedSplit.length === 0) return alert("請輸入金額並選擇分攤成員");

    const payload = {
        payer: currentUser.account,
        payerName: currentUser.nickname,
        amount: parseFloat(amount),
        currency,
        category: category || "一般",
        note,
        splitWith: selectedSplit
    };

    try {
        const res = await apiFetch(`${API_URL}/api/trips/${tripId}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeAddModal();
            fetchExpenses();
        } else {
            alert("新增支出失敗");
        }
    } catch (error) {
        console.error("新增支出失敗", error);
        alert("新增支出失敗");
    }
}

async function fetchExpenses() {
    const res = await apiFetch(`${API_URL}/api/trips/${tripId}/expenses`);
    if (res.status === 403) return denyAccess();
    if (!res.ok) return alert('載入支出失敗');
    const expenses = await res.json().catch(() => null);
    if (!Array.isArray(expenses)) {
        const list = document.getElementById('expense-list');
        const errorMessage = document.createElement('p');
        errorMessage.className = 'empty-text';
        errorMessage.textContent = '支出資料格式錯誤';
        list.replaceChildren(errorMessage);
        calculateBalances([]);
        return;
    }
    renderExpenses(expenses);
    calculateBalances(expenses);
}

function renderExpenses(expenses) {
    const list = document.getElementById('expense-list');
    if (expenses.length === 0) {
        const emptyText = document.createElement('p');
        emptyText.className = 'empty-text';
        emptyText.textContent = '🍂 目前尚無支出紀錄';
        list.replaceChildren(emptyText);
        return;
    }

    const expenseCards = expenses.map(e => {
        const card = document.createElement('div');
        card.className = 'expense-card';

        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn-delete-exp';
        deleteButton.textContent = '×';
        deleteButton.addEventListener('click', () => deleteExpense(e._id));

        const header = document.createElement('div');
        header.className = 'expense-header';
        const category = document.createElement('span');
        category.className = 'category-tag';
        category.textContent = e.category;
        header.appendChild(category);

        const amountDisplay = document.createElement('div');
        amountDisplay.className = 'amount-display';
        const amount = Number(e.amount);
        amountDisplay.textContent = Number.isFinite(amount) ? amount.toLocaleString() : String(e.amount ?? '');
        const currency = document.createElement('span');
        currency.className = 'currency-code';
        currency.textContent = e.currency;
        amountDisplay.append(' ', currency);

        const footer = document.createElement('div');
        footer.className = 'expense-footer';
        const payer = document.createElement('span');
        payer.textContent = `👤 ${e.payerName} 付款`;
        const splitCount = document.createElement('span');
        splitCount.textContent = `👥 分給 ${Array.isArray(e.splitWith) ? e.splitWith.length : 0} 人`;
        footer.append(payer, splitCount);

        card.append(deleteButton, header, amountDisplay, footer);
        if (e.note) {
            const note = document.createElement('p');
            note.style.cssText = 'font-size:0.8rem; margin-top:10px; color:#888; font-style:italic;';
            note.textContent = `"${e.note}"`;
            card.appendChild(note);
        }
        return card;
    });
    list.replaceChildren(...expenseCards);
}

// 核心分帳算法：誰該給誰錢
function calculateBalances(expenses) {
    const balancesByCurrency = new Map();
    const normalizeCurrency = value => {
        const currency = typeof value === 'string' ? value.trim().toUpperCase() : '';
        return currency || 'UNKNOWN';
    };
    const getBalances = currency => {
        if (!balancesByCurrency.has(currency)) {
            const balances = new Map();
            tripParticipants.forEach(acc => balances.set(acc, 0));
            balancesByCurrency.set(currency, balances);
        }
        return balancesByCurrency.get(currency);
    };

    expenses.forEach(e => {
        const amount = Number(e.amount);
        const splitWith = Array.isArray(e.splitWith) ? e.splitWith : [];
        if (!Number.isFinite(amount) || splitWith.length === 0) return;
        const balances = getBalances(normalizeCurrency(e.currency));
        const perPerson = amount / splitWith.length;

        // 付款人先墊了全額，所以他應該「收回」除了自己那份以外的錢
        balances.set(e.payer, (balances.get(e.payer) ?? 0) + amount);

        // 每個參與分攤的人，都欠下這筆錢
        splitWith.forEach(acc => {
            balances.set(acc, (balances.get(acc) ?? 0) - perPerson);
        });
    });

    const summary = document.getElementById('balance-summary');
    const heading = document.createElement('h3');
    heading.textContent = '結算總覽';
    const summaryList = document.createElement('div');
    summaryList.id = 'balance-list';
    summaryList.style.cssText = 'font-size: 0.9rem; opacity: 0.9;';
    const currencyOrder = ['TWD', 'JPY', 'USD'];
    const currencies = [...balancesByCurrency.keys()].sort((a, b) => {
        const aOrder = currencyOrder.indexOf(a), bOrder = currencyOrder.indexOf(b);
        if (a === 'UNKNOWN') return 1;
        if (b === 'UNKNOWN') return -1;
        if (aOrder !== -1 || bOrder !== -1) return (aOrder === -1 ? Infinity : aOrder) - (bOrder === -1 ? Infinity : bOrder);
        return a.localeCompare(b);
    });

    if (currencies.length === 0) {
        const balancedText = document.createElement('div');
        balancedText.textContent = '目前帳目平整';
        summaryList.appendChild(balancedText);
    } else {
        currencies.forEach(currency => {
            const currencyHeading = document.createElement('h4');
            currencyHeading.textContent = currency === 'UNKNOWN' ? '未指定幣別' : currency;
            summaryList.appendChild(currencyHeading);
            let hasBalance = false;
            for (const [acc, balance] of balancesByCurrency.get(currency)) {
                const displayName = acc === currentUser.account ? '我' : acc;
                const row = document.createElement('div');
                const amount = document.createElement('span');
                amount.style.fontWeight = 'bold';
                if (balance > 0.1) { row.textContent = `${displayName}: 應收回 `; amount.style.color = '#fff'; amount.textContent = `${balance.toFixed(1)} ${currency === 'UNKNOWN' ? '未指定幣別' : currency}`; row.appendChild(amount); summaryList.appendChild(row); hasBalance = true; }
                else if (balance < -0.1) { row.textContent = `${displayName}: 應支付 `; amount.style.color = '#ffcccc'; amount.textContent = `${Math.abs(balance).toFixed(1)} ${currency === 'UNKNOWN' ? '未指定幣別' : currency}`; row.appendChild(amount); summaryList.appendChild(row); hasBalance = true; }
            }
            if (!hasBalance) { const balancedText = document.createElement('div'); balancedText.textContent = '目前帳目平整'; summaryList.appendChild(balancedText); }
        });
    }

    summary.replaceChildren(heading, summaryList);
    const settlement = document.createElement('section');
    const settlementHeading = document.createElement('h3'); settlementHeading.textContent = '建議結算'; settlement.appendChild(settlementHeading);
    currencies.forEach(currency => {
        const currencyHeading = document.createElement('h4'); currencyHeading.textContent = currency === 'UNKNOWN' ? '未指定幣別' : currency; settlement.appendChild(currencyHeading);
        const transfers = window.YashYashSettlement.calculateSettlements(balancesByCurrency.get(currency));
        if (!transfers.length) { const none = document.createElement('div'); none.textContent = '目前無需結算'; settlement.appendChild(none); }
        transfers.forEach(transfer => { const row = document.createElement('div'); row.textContent = `${transfer.from} → ${transfer.to}：${transfer.amount.toFixed(1)} ${currency === 'UNKNOWN' ? '未指定幣別' : currency}`; settlement.appendChild(row); });
    });
    summary.appendChild(settlement);
}

async function deleteExpense(id) {
    if (!confirm("確定刪除此筆支出？")) return;
    try {
        const res = await apiFetch(`${API_URL}/api/expenses/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            alert("刪除支出失敗");
            return;
        }
        fetchExpenses();
    } catch (error) {
        console.error("刪除支出失敗", error);
        alert("刪除支出失敗");
    }
}

document.getElementById('back-to-details').addEventListener('click', () => {
    window.location.href = `trip-details.html?id=${encodeURIComponent(tripId)}`;
});


const API_URL = 'https://yash-yash.onrender.com';
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const currentUser = JSON.parse(localStorage.getItem('yashyash_user'));

let tripParticipants = []; // 行程成員
let selectedSplit = [];    // 目前選中要分攤的人
let tripExpired = false;

window.onload = async () => {
    await fetchTripInfo();
    await fetchExpenses();
};

async function fetchTripInfo() {
    const res = await fetch(`${API_URL}/api/trips/${tripId}`);
    const trip = await res.json();
    tripParticipants = trip.participants;
    const today = new Date().toISOString().split('T')[0];
    const end = (trip.endDate || '').split('T')[0];
    tripExpired = !!end && end < today;
    const addBtn = document.getElementById('add-expense-btn');
    if (addBtn) addBtn.style.display = tripExpired ? 'none' : '';
    renderSplitList();
}

function renderSplitList() {
    const container = document.getElementById('participant-split-list');
    // 預設全選
    selectedSplit = [...tripParticipants];
    
    container.innerHTML = tripParticipants.map(acc => `
        <div class="split-item active" id="split-${acc}" onclick="toggleSplit('${acc}')">
            ${acc === currentUser.account ? '我' : acc}
        </div>
    `).join('');
}

function toggleSplit(acc) {
    const el = document.getElementById(`split-${acc}`);
    if (selectedSplit.includes(acc)) {
        selectedSplit = selectedSplit.filter(a => a !== acc);
        el.classList.remove('active');
    } else {
        selectedSplit.push(acc);
        el.classList.add('active');
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

    const res = await fetch(`${API_URL}/api/trips/${tripId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        closeAddModal();
        fetchExpenses();
    }
}

async function fetchExpenses() {
    const res = await fetch(`${API_URL}/api/trips/${tripId}/expenses`);
    const expenses = await res.json();
    renderExpenses(expenses);
    calculateBalances(expenses);
}

function renderExpenses(expenses) {
    const list = document.getElementById('expense-list');
    if (expenses.length === 0) {
        list.innerHTML = '<p class="empty-text">🍂 目前尚無支出紀錄</p>';
        return;
    }

    list.innerHTML = expenses.map(e => `
        <div class="expense-card">
            ${tripExpired ? '' : `<button onclick="deleteExpense('${e._id}')" class="btn-delete-exp">×</button>`}
            <div class="expense-header">
                <span class="category-tag">${e.category}</span>
            </div>
            <div class="amount-display">
                ${e.amount.toLocaleString()} <span class="currency-code">${e.currency}</span>
            </div>
            <div class="expense-footer">
                <span>👤 ${e.payerName} 付款</span>
                <span>👥 分給 ${e.splitWith.length} 人</span>
            </div>
            ${e.note ? `<p style="font-size:0.8rem; margin-top:10px; color:#888; font-style:italic;">"${e.note}"</p>` : ''}
        </div>
    `).join('');
}

// 核心分帳算法：誰該給誰錢
function calculateBalances(expenses) {
    const balances = {}; // 紀錄每個人的淨額 (正代表該收錢，負代表該給錢)
    tripParticipants.forEach(acc => balances[acc] = 0);

    expenses.forEach(e => {
        const perPerson = e.amount / e.splitWith.length;
        
        // 付款人先墊了全額，所以他應該「收回」除了自己那份以外的錢
        balances[e.payer] += e.amount;
        
        // 每個參與分攤的人，都欠下這筆錢
        e.splitWith.forEach(acc => {
            balances[acc] -= perPerson;
        });
    });

    const summaryList = document.getElementById('balance-list');
    let html = "";
    
    for (let acc in balances) {
        const b = balances[acc];
        if (b > 0.1) {
            html += `<div>${acc === currentUser.account ? '我' : acc}: 應收回 <span style="color:#fff; font-weight:bold;">${b.toFixed(1)}</span></div>`;
        } else if (b < -0.1) {
            html += `<div>${acc === currentUser.account ? '我' : acc}: 應支付 <span style="color:#ffcccc; font-weight:bold;">${Math.abs(b).toFixed(1)}</span></div>`;
        }
    }
    
    document.getElementById('balance-summary').innerHTML = `
        <h3>結算總覽</h3>
        ${html || "目前帳目平整"}
    `;
}

async function deleteExpense(id) {
    if (tripExpired) return;
    if (!confirm("確定刪除此筆支出？")) return;
    await fetch(`${API_URL}/api/expenses/${id}`, { method: 'DELETE' });
    fetchExpenses();
}

document.getElementById('back-to-details').onclick = () => window.location.href = `trip-details.html?id=${tripId}`;

// ===== PWA Service Worker 註冊 =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('PWA Ready! Scope:', reg.scope))
            .catch(err => console.log('PWA Error:', err));
    });
}

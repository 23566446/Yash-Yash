// --- State Management ---
let state = {
    currentUser: null,
    proposals: [], 
    trips: []      
};

const API_URL = 'https://yash-yash.onrender.com';

// --- View Navigation ---
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

// --- Auth Logic (註冊與登入) ---
let isRegisterMode = false;

function toggleMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('register-only').classList.toggle('hidden');
    document.getElementById('auth-btn').innerText = isRegisterMode ? "立即註冊" : "進入專案";
    document.getElementById('toggle-text').innerText = isRegisterMode ? "已有帳號？登入" : "沒有帳號？註冊";
}

async function handleAuth() {
    const account = document.getElementById('acc').value;
    const password = document.getElementById('pw').value;
    
    const endpoint = isRegisterMode ? '/api/register' : '/api/login';
    const payload = isRegisterMode ? {
        account, password, 
        nickname: document.getElementById('nick').value,
        gender: document.getElementById('gen').value
    } : { account, password };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            alert(isRegisterMode ? "註冊成功！" : "登入成功！");
            state.currentUser = data.user;
            document.getElementById('user-display').innerText = data.user.nickname;
            showView('view-main');
            loadInitialData(); // 登入後立即抓取資料庫裡的行程
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert("連線後端失敗");
    }
}

// --- 資料讀取 (從 MongoDB 抓取) ---
async function loadInitialData() {
    try {
        const response = await fetch(`${API_URL}/api/proposals`);
        if (response.ok) {
            state.proposals = await response.json();
            renderAll();
        }
    } catch (err) {
        console.error("抓取行程失敗", err);
    }
}

// --- Trip Proposal Logic (發起行程) ---
async function createProposal() {
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;
    const min = document.getElementById('min-ppl').value;

    if(!start || !end) return alert("請選擇日期");

    const newProposal = {
        creator: state.currentUser.nickname,
        start,
        end,
        min: parseInt(min),
        votes: [state.currentUser.nickname] // 發起人預設投一票
    };

    try {
        // 將行程存入 MongoDB
        const response = await fetch(`${API_URL}/api/proposals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProposal)
        });

        if (response.ok) {
            alert("行程已發佈到公告欄！");
            showView('view-main');
            loadInitialData(); // 重新整理畫面
        }
    } catch (err) {
        alert("發佈失敗");
    }
}

// --- Voting Logic (投票) ---
async function vote(proposalId) {
    try {
        const response = await fetch(`${API_URL}/api/proposals/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proposalId,
                nickname: state.currentUser.nickname
            })
        });

        if (response.ok) {
            loadInitialData(); // 投票後重新整理
        } else {
            const data = await response.json();
            alert(data.message);
        }
    } catch (err) {
        alert("投票失敗");
    }
}

// --- Rendering Logic (渲染畫面) ---
function renderAll() {
    const board = document.getElementById('announcement-board');
    const tripList = document.getElementById('trip-list');

    // 渲染公告欄
    if (state.proposals.length === 0) {
        board.innerHTML = '<p class="empty-text">目前沒有公告中的行程。</p>';
    } else {
        board.innerHTML = state.proposals.map(p => `
            <div class="proposal-card wabi-card">
                <strong>${p.creator} 發起的旅行</strong><br>
                📅 ${p.start} ~ ${p.end}<br>
                👥 達成門檻：${p.votes.length} / ${p.min}<br>
                <button onclick="vote('${p._id}')" class="btn-text">我要參加 (+1)</button>
            </div>
        `).join('');
    }

    // 渲染正式行程 (這部分可以等行程確認功能寫好後再擴充)
    if (state.trips.length === 0) {
        tripList.innerHTML = '<p class="empty-text">尚無確定的行程。</p>';
    }
}

// 初始化
window.onload = () => {
    if ('serviceWorker' in navigator) {
        console.log("PWA Ready");
    }
};

// ===== PWA Service Worker 註冊 =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('PWA Ready! Scope:', reg.scope))
            .catch(err => console.log('PWA Error:', err));
    });
}

const API_URL = 'https://yash-yash.onrender.com';
const userData = localStorage.getItem('yashyash_user');
if (!userData) { window.location.href = 'login.html'; }
const currentUser = JSON.parse(userData);

window.onload = () => {
    if (currentUser.avatar) {
        document.querySelectorAll('.nav-avatar').forEach(img => img.src = currentUser.avatar);
        const sideAvatar = document.getElementById('side-user-avatar');
        if(sideAvatar) sideAvatar.src = currentUser.avatar;
    }
    document.getElementById('side-display-name').innerText = currentUser.nickname;
    loadMarquee(); loadProposals(); loadMyTrips();
};

// 載入跑馬燈內容
async function loadMarquee() {
    try {
        const res = await fetch(`${API_URL}/api/settings/marquee`);
        const data = await res.json();
        document.getElementById('marquee-text').innerText = data.text;
    } catch (e) { document.getElementById('marquee-text').innerText = "歡迎來到 YashYash！"; }
}

async function loadProposals() {
    const res = await fetch(`${API_URL}/api/proposals`);
    const data = await res.json();
    const board = document.getElementById('announcement-board');
    const visible = data.filter(p => p.status === 'voting' || p.status === 'pending');

    if (visible.length === 0) { board.innerHTML = '<p class="empty-text">尚無公告</p>'; return; }

    board.innerHTML = visible.map(p => {
        const hasVoted = p.votes.includes(currentUser.account);
        const isReached = p.votes.length >= p.min;
        const isOwner = (p.creator === currentUser.nickname || currentUser.account === 'admin' || currentUser.role === 'manager');

        return `
            <div class="proposal-card wabi-card">
                <div class="card-header" style="display:flex;justify-content:space-between;">
                    <strong>${p.creator} 的提案</strong>
                    <span style="font-size:10px; color:${isReached?'#8a9a5b':'#888'}">${isReached?'✅ 已達標':'⏳ 投票中'}</span>
                </div>
                <p style="font-size:0.85rem; margin:10px 0;">📅 ${p.start} ~ ${p.end}</p>
                <p style="font-size:0.8rem;">進度: ${p.votes.length} / ${p.min}</p>
                <div style="display:flex; gap:5px; margin-bottom:10px;">
                    ${isOwner ? `<button onclick="editProposal('${p._id}','${p.start}','${p.end}',${p.min})" class="btn-small">編輯</button>` : ''}
                    ${isOwner ? `<button onclick="deleteProposal('${p._id}')" class="btn-small" style="color:red">刪除</button>` : ''}
                </div>
                <button onclick="vote('${p._id}')" class="${hasVoted?'btn-disabled':'btn-primary'}" ${hasVoted?'disabled':''} style="width:100%">
                    ${hasVoted?'你已參加':'我要參加'}
                </button>
            </div>
        `;
    }).join('');
}

async function vote(proposalId) {
    try {
        const response = await fetch(`${API_URL}/api/proposals/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                proposalId: proposalId, 
                account: currentUser.account // 傳送唯一的 account
            })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'pending') alert("太棒了！活動已達標，等待發起人確認。");
            loadProposals(); 
        }
    } catch (e) { alert("投票失敗"); }
}

// 新增選單切換功能
function toggleMenu() {
    document.getElementById('side-menu').classList.toggle('active');
    let overlay = document.querySelector('.menu-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'menu-overlay';
        overlay.onclick = toggleMenu;
        document.body.appendChild(overlay);
    }
    overlay.style.display = document.getElementById('side-menu').classList.contains('active') ? 'block' : 'none';
}

function scrollToArchive() {
    toggleMenu();
    document.getElementById('archive-section').scrollIntoView({ behavior: 'smooth' });
}

// 修正後的 loadMyTrips：區分「現在」與「過去」
// 修改後的 loadMyTrips：只顯示未來的行程
async function loadMyTrips() {
    const res = await fetch(`${API_URL}/api/my-trips/${currentUser.account}`);
    const data = await res.json();
    const list = document.getElementById('trip-list');
    const today = new Date().toISOString().split('T')[0];
    const active = data.filter(t => t.endDate >= today);

    if (active.length === 0) { list.innerHTML = '<p class="empty-text">尚無進行中的旅行</p>'; return; }

    list.innerHTML = active.map(t => `
        <div class="trip-card wabi-card" onclick="location.href='trip-details.html?id=${t._id}'" style="border-left:5px solid #8a9a5b; cursor:pointer;">
            <h4>${t.title}</h4>
            <p style="font-size:0.85rem;">📅 ${t.startDate} ~ ${t.endDate}</p>
            <p style="font-size:0.75rem; color:#8a9a5b; margin-top:10px;">👤 夥伴共 ${t.participants.length} 位</p>
        </div>
    `).join('');
}

// 抽離出小卡渲染函數，方便重複使用
function renderTripCard(t, isPast) {
    return `
        <div class="trip-card wabi-card" onclick="location.href='trip-details.html?id=${t._id}'" style="cursor:pointer; position:relative;">
            ${isPast ? '<span style="font-size:10px; color:#999; border:1px solid #ddd; padding:2px 5px; border-radius:3px; position:absolute; top:15px; right:15px;">已結束</span>' : ''}
            <h4 style="margin:0 0 5px 0;">${t.title}</h4>
            <p style="font-size:0.85rem; color:#666;">📅 ${t.startDate} ~ ${t.endDate}</p>
            <div style="font-size:0.75rem; color:var(--accent-color); margin-top:10px;">
                👤 共有 ${t.participants.length} 位夥伴
            </div>
        </div>
    `;
}

async function editProposal(id, oldStart, oldEnd, oldMin) {
    const ns = prompt("請輸入新開始日期 (YYYY-MM-DD):", oldStart);
    if (!ns) return;
    const ne = prompt("請輸入新結束日期 (YYYY-MM-DD):", oldEnd);
    if (!ne) return;
    const nm = prompt("請輸入新門檻人數:", oldMin);
    if (!nm) return;

    try {
        const response = await fetch(`${API_URL}/api/proposals/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start: ns, end: ne, min: parseInt(nm) })
        });

        if (response.ok) {
            const updatedData = await response.json();
            
            // 加入提示邏輯
            if (updatedData.status === 'voting' && parseInt(nm) > oldMin) {
                alert("提案已更新！由於提高了門檻，活動將回到「招募中」狀態。");
            } else {
                alert("提案已更新！");
            }
            
            loadProposals();
        }
    } catch (err) { alert("網路錯誤"); }
}

async function deleteProposal(id) {
    if (!confirm("確定要刪除這個行程提案嗎？")) return;
    const response = await fetch(`${API_URL}/api/proposals/${id}`, { method: 'DELETE' });
    if (response.ok) { alert("提案已撤回"); loadProposals(); }
}

function logout() { localStorage.removeItem('yashyash_user'); window.location.href = 'login.html'; }
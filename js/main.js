const API_URL = 'https://yash-yash.onrender.com';
const userData = localStorage.getItem('yashyash_user');
if (!userData) { window.location.href = 'login.html'; }
const currentUser = JSON.parse(userData);

window.onload = () => {
    if (currentUser.avatar) {
        const avatars = document.querySelectorAll('.nav-avatar, #side-user-avatar');
        avatars.forEach(img => img.src = currentUser.avatar);
    }
    document.getElementById('side-display-name').innerText = currentUser.nickname;
    
    loadMarquee();
    loadProposals(); 
    loadMyTrips();   
};

async function loadMarquee() {
    const res = await fetch(`${API_URL}/api/settings/marquee`);
    const data = await res.json();
    document.getElementById('marquee-text').innerText = data.text;
}

async function loadProposals() {
    try {
        const response = await fetch(`${API_URL}/api/proposals`);
        const proposals = await response.json();
        const board = document.getElementById('announcement-board');
        const visible = proposals.filter(p => p.status === 'voting' || p.status === 'pending');

        if (visible.length === 0) {
            board.innerHTML = '<p class="empty-text">目前沒有公告中的行程。</p>';
            return;
        }

        board.innerHTML = visible.map(p => {
            const hasVoted = p.votes.includes(currentUser.account);
            const isReached = p.votes.length >= p.min;
            const isSuper = (currentUser.account === 'admin' || currentUser.role === 'admin');
            const isManager = (currentUser.role === 'manager');
            const isCreator = (p.creator === currentUser.nickname);

            return `
                <div class="proposal-card wabi-card">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <strong>${p.creator} 發起的旅行</strong>
                            <div class="status-tag" style="background: ${isReached ? '#8a9a5b' : '#eee'}; color: ${isReached ? 'white' : '#666'}; padding:2px 8px; font-size:10px; border-radius:4px;">
                                ${isReached ? '✅ 已達標 (仍可參加)' : '⏳ 投票中'}
                            </div>
                        </div>
                        <div class="owner-actions">
                            ${(isCreator || isManager || isSuper) ? `<button onclick="editProposal('${p._id}', '${p.start}', '${p.end}', ${p.min})" class="btn-small">編輯</button>` : ''}
                            ${(isCreator || isSuper) ? `<button onclick="deleteProposal('${p._id}')" class="btn-small" style="color:red; border-color:red;">刪除</button>` : ''}
                        </div>
                    </div>
                    <p style="margin:10px 0;">📅 ${p.start} ~ ${p.end}</p>
                    <div style="font-size:0.85rem; margin-bottom:12px; color:#555;">
                        目前人數：<strong>${p.votes.length}</strong> / 門檻：${p.min} 人
                    </div>
                    <button onclick="vote('${p._id}')" class="${hasVoted ? 'btn-disabled' : 'btn-vote'}" ${hasVoted ? 'disabled' : ''} style="width:100%;">
                        ${hasVoted ? '✓ 你已參加' : '我要參加 (+1)'}
                    </button>
                </div>
            `;
        }).join('');
    } catch (e) { console.error(e); }
}

async function vote(proposalId) {
    const response = await fetch(`${API_URL}/api/proposals/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, account: currentUser.account })
    });
    if (response.ok) { loadProposals(); }
}

async function loadMyTrips() {
    try {
        const response = await fetch(`${API_URL}/api/my-trips/${currentUser.account}`);
        const trips = await response.json();
        const tripList = document.getElementById('trip-list');
        const today = new Date().toISOString().split('T')[0];
        const activeTrips = trips.filter(t => t.endDate >= today);

        if (activeTrips.length === 0) {
            tripList.innerHTML = '<p class="empty-text">目前沒有進行中的行程。</p>';
        } else {
            tripList.innerHTML = activeTrips.map(t => `
                <div class="trip-card wabi-card" onclick="location.href='trip-details.html?id=${t._id}'" style="cursor:pointer; border-left: 5px solid #8a9a5b;">
                    <h4>${t.title}</h4>
                    <p style="font-size:0.85rem; color:#666;">📅 ${t.startDate} ~ ${t.endDate}</p>
                    <div style="font-size:0.75rem; color:#8a9a5b; margin-top:10px;">👤 共有 ${t.participants.length} 位夥伴</div>
                </div>
            `).join('');
        }
    } catch (err) { console.error(err); }
}

function toggleMenu() {
    document.getElementById('side-menu').classList.toggle('active');
    let overlay = document.querySelector('.menu-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'menu-overlay';
        overlay.onclick = toggleMenu;
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active');
}

async function editProposal(id, s, e, m) {
    const ns = prompt("新開始日期:", s); const ne = prompt("新結束日期:", e); const nm = prompt("新門檻:", m);
    if (!ns || !ne) return;
    await fetch(`${API_URL}/api/proposals/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: ns, end: ne, min: parseInt(nm) })
    });
    loadProposals();
}

async function deleteProposal(id) {
    if (!confirm("確定刪除？")) return;
    await fetch(`${API_URL}/api/proposals/${id}`, { method: 'DELETE' });
    loadProposals();
}

function logout() { localStorage.removeItem('yashyash_user'); window.location.href = 'login.html'; }
const API_URL = 'https://yash-yash.onrender.com';

// 1. 檢查 Session
const userData = localStorage.getItem('yashyash_user');
if (!userData) {
    window.location.href = 'login.html';
}

const currentUser = JSON.parse(userData);

// 2. 初始化頁面
window.onload = () => {
    document.getElementById('display-name').innerText = `你好，${currentUser.nickname}`;
    
    // 同時載入「公告欄」與「我的旅行」
    loadProposals(); 
    loadMyTrips();   
};

// 3. 登出功能
function logout() {
    localStorage.removeItem('yashyash_user');
    window.location.href = 'login.html';
}

// 4. 載入「公告欄」行程
async function loadProposals() {
    try {
        const response = await fetch(`${API_URL}/api/proposals`);
        const proposals = await response.json();
        const board = document.getElementById('announcement-board');

        // 過濾邏輯：顯示投票中 (voting) 與 待確認 (pending) 的行程
        const visibleProposals = proposals.filter(p => p.status === 'voting' || p.status === 'pending');

        if (visibleProposals.length === 0) {
            board.innerHTML = '<p class="empty-text">目前沒有公告中的行程。</p>';
            return;
        }

        board.innerHTML = visibleProposals.map(p => {
            const hasVoted = p.votes.includes(currentUser.nickname);
            const isReached = p.votes.length >= p.min;
            const isOwner = p.creator === currentUser.nickname || currentUser.account === 'admin';

        return `
                <div class="proposal-card wabi-card">
                    <div class="card-header">
                        <strong>${p.creator} 發起的旅行</strong>
                        <span class="status-tag" style="background: ${isReached ? '#8a9a5b' : '#eee'};">
                            ${isReached ? '✅ 已達標' : '⏳ 投票中'}
                        </span>
                    </div>
                    <p>📅 ${p.start} ~ ${p.end}</p>
                    <div class="progress-bar">
                        目前：${p.votes.length} / ${p.min} 人
                    </div>
                    <button onclick="vote('${p._id}')" class="${hasVoted ? 'btn-disabled' : 'btn-vote'}" ${hasVoted ? 'disabled' : ''}>
                        ${hasVoted ? '已參加' : '我要參加'}
                    </button>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("載入失敗:", err);
    }
}

// 5. 投票邏輯
async function vote(proposalId) {
    try {
        const response = await fetch(`${API_URL}/api/proposals/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proposalId: proposalId,
                nickname: currentUser.nickname
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'pending') {
                alert("太棒了！活動已達標，等待發起人確認。");
            }
            loadProposals(); 
        }
    } catch (err) {
        alert("投票失敗");
    }
}

// 6. 編輯提案 (日期與人數)
async function editProposal(id, oldStart, oldEnd, oldMin) {
    const newStart = prompt("請輸入新開始日期 (YYYY-MM-DD):", oldStart);
    if (newStart === null) return; // 取消
    
    const newEnd = prompt("請輸入新結束日期 (YYYY-MM-DD):", oldEnd);
    if (newEnd === null) return;

    // 防呆：日期不能為空
    if (!newStart.trim() || !newEnd.trim()) {
        alert("🚨 日期不得為空！");
        return;
    }

    const newMin = prompt("請輸入新門檻人數:", oldMin);
    if (newMin === null) return;

    try {
        const response = await fetch(`${API_URL}/api/proposals/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                start: newStart, 
                end: newEnd, 
                min: parseInt(newMin) 
            })
        });

        if (response.ok) {
            alert("提案已更新！");
            loadProposals();
        } else {
            const err = await response.json();
            alert("修改失敗: " + err.message);
        }
    } catch (err) {
        alert("網路錯誤");
    }
}

// 7. 刪除提案
async function deleteProposal(id) {
    if (!confirm("確定要刪除這個行程提案嗎？")) return;

    try {
        const response = await fetch(`${API_URL}/api/proposals/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert("提案已撤回");
            loadProposals();
        }
    } catch (err) {
        alert("刪除失敗");
    }
}

// 8. 載入「我的旅行」小卡 (正式行程)
async function loadMyTrips() {
    try {
        const response = await fetch(`${API_URL}/api/my-trips/${currentUser.nickname}`);
        const trips = await response.json();
        const tripList = document.getElementById('trip-list');

        if (trips.length === 0) {
            tripList.innerHTML = '<p class="empty-text">尚無確定的行程。</p>';
            return;
        }

        tripList.innerHTML = trips.map(t => `
            <div class="trip-card wabi-card" onclick="goToTripDetails('${t._id}')" style="cursor:pointer; border-left: 5px solid #8a9a5b;">
                <div class="trip-status-tag" style="background: #8a9a5b; color: white; display: inline-block; padding: 2px 8px; font-size: 0.7rem; border-radius: 4px;">正式行程</div>
                <h4 style="margin: 10px 0;">${t.title}</h4>
                <p>📅 ${t.startDate} ~ ${t.endDate}</p>
                <p>👤 參加人數：${t.participants.length} 人</p>
                <div class="trip-footer" style="margin-top: 10px; font-size: 0.8rem; color: #8a9a5b;">
                    查看詳情與聊天室 →
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("載入正式行程失敗:", err);
    }
}

function goToTripDetails(tripId) {
    window.location.href = `trip-details.html?id=${tripId}`;

}

// main.js - 首頁核心功能
const API_URL = 'https://yash-yash.onrender.com';
let currentUser = null;

// ===== 初始化載入 =====
window.onload = async function() {
    // 檢查登入狀態
    const user = JSON.parse(localStorage.getItem('yashyash_user'));
    if (!user) {
        location.href = 'login.html';
        return;
    }
    
    currentUser = user;
    
    // 更新側邊欄使用者資訊
    document.getElementById('side-display-name').innerText = user.nickname || user.account;
    
    // 載入頭像
    if (user.avatar) {
        document.getElementById('side-user-avatar').src = user.avatar;
    }
    
    // 載入資料
    await loadMarquee();
    await loadProposals();
    await loadMyTrips();
    await checkNotifications();
};

// ===== 跑馬燈載入 =====
async function loadMarquee() {
    try {
        const res = await fetch(`${API_URL}/api/settings/marquee`);
        const data = await res.json();
        document.getElementById('marquee-text').innerText = data.text || '歡迎來到 YashYash！';
    } catch (e) {
        console.error("載入跑馬燈失敗:", e);
    }
}

// ===== 載入公告欄提案 =====
async function loadProposals() {
    const board = document.getElementById('announcement-board');
    
    try {
        const res = await fetch(`${API_URL}/api/proposals`);
        const proposals = await res.json();
        
        if (proposals.length === 0) {
            board.innerHTML = '<p class="empty-text">目前沒有公告中的行程提案。</p>';
            return;
        }
        
        board.innerHTML = proposals.map(p => {
            const isCreator = p.creator === currentUser.nickname;
            const hasVoted = p.votes.includes(currentUser.account);
            const progress = Math.min((p.votes.length / p.min) * 100, 100);
            const isPending = p.status === 'pending';
            
            return `
                <div class="proposal-card wabi-card">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                        <strong style="font-size: 1.1rem; color: var(--text-color);">${p.creator} 發起的旅行</strong>
                        ${isCreator ? `
                            <button onclick="editProposal('${p._id}')" class="btn-small" style="font-size: 0.7rem;">✏️ 編輯</button>
                        ` : ''}
                    </div>
                    
                    <div style="margin: 12px 0; color: #666;">
                        📅 ${formatDate(p.start)} ~ ${formatDate(p.end)}
                    </div>
                    
                    <div style="background: var(--bg-color); padding: 12px; border-radius: 8px; margin: 12px 0;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 0.85rem;">參加人數</span>
                            <span style="font-weight: bold; color: var(--accent-color);">${p.votes.length} / ${p.min}</span>
                        </div>
                        <div style="background: #ddd; height: 8px; border-radius: 10px; overflow: hidden;">
                            <div style="background: var(--accent-color); height: 100%; width: ${progress}%; transition: width 0.3s;"></div>
                        </div>
                    </div>
                    
                    ${isPending ? `
                        <div style="background: #fff3cd; padding: 10px; border-radius: 8px; margin: 10px 0; border-left: 3px solid var(--clay);">
                            <strong style="color: #856404;">🎉 人數已達標！</strong><br>
                            <small style="color: #856404;">等待發起人確認建立正式行程</small>
                        </div>
                    ` : ''}
                    
                    <div style="display: flex; gap: 8px; margin-top: 15px;">
                        ${!hasVoted ? `
                            <button onclick="vote('${p._id}')" class="btn-primary" style="flex: 1;">
                                ✋ 我要參加
                            </button>
                        ` : `
                            <button class="btn-primary" style="flex: 1; opacity: 0.6; cursor: not-allowed;" disabled>
                                ✓ 已報名
                            </button>
                        `}
                        
                        ${isCreator ? `
                            <button onclick="deleteProposal('${p._id}')" class="btn-small" style="color: var(--danger); border-color: var(--danger);">
                                🗑️
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (e) {
        console.error("載入提案失敗:", e);
        board.innerHTML = '<p class="empty-text" style="color: var(--danger);">載入失敗，請重新整理頁面</p>';
    }
}

// ===== 編輯提案功能 =====
async function editProposal(proposalId) {
    try {
        // 取得目前提案資料
        const res = await fetch(`${API_URL}/api/proposals`);
        const proposals = await res.json();
        const proposal = proposals.find(p => p._id === proposalId);
        
        if (!proposal) {
            alert("找不到該提案");
            return;
        }
        
        // 彈出編輯視窗
        const newStart = prompt("修改開始日期 (YYYY-MM-DD):", proposal.start);
        if (!newStart) return;
        
        const newEnd = prompt("修改結束日期 (YYYY-MM-DD):", proposal.end);
        if (!newEnd) return;
        
        const newMin = prompt("修改最低成行人數:", proposal.min);
        if (!newMin) return;
        
        // 驗證日期
        if (new Date(newEnd) < new Date(newStart)) {
            alert("結束日期不能早於開始日期！");
            return;
        }
        
        // 送出修改
        const updateRes = await fetch(`${API_URL}/api/proposals/${proposalId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: newStart,
                end: newEnd,
                min: parseInt(newMin)
            })
        });
        
        if (updateRes.ok) {
            alert("✅ 提案已成功更新！");
            await loadProposals(); // 重新載入列表
        } else {
            const error = await updateRes.json();
            alert("❌ 更新失敗：" + error.message);
        }
        
    } catch (e) {
        console.error("編輯提案失敗:", e);
        alert("網路錯誤，請稍後再試");
    }
}

// ===== 投票功能 =====
async function vote(proposalId) {
    try {
        const res = await fetch(`${API_URL}/api/proposals/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proposalId,
                account: currentUser.account
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            
            // 如果達標了，顯示特別提示
            if (data.status === 'pending') {
                alert("🎉 恭喜！你的參加讓這個行程達成門檻了！\n發起人將收到通知來建立正式行程。");
            } else {
                alert("✅ 參加成功！");
            }
            
            await loadProposals();
        } else {
            const error = await res.json();
            alert(error.message);
        }
    } catch (e) {
        alert("投票失敗，請稍後再試");
    }
}

// ===== 刪除提案 =====
async function deleteProposal(proposalId) {
    if (!confirm("確定要刪除這個提案嗎？此操作無法復原。")) return;
    
    try {
        const res = await fetch(`${API_URL}/api/proposals/${proposalId}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            alert("✅ 提案已刪除");
            await loadProposals();
        }
    } catch (e) {
        alert("刪除失敗");
    }
}

// ===== 載入我的行程 =====
async function loadMyTrips() {
    const tripList = document.getElementById('trip-list');
    
    try {
        const res = await fetch(`${API_URL}/api/my-trips/${currentUser.account}`);
        const trips = await res.json();
        
        // 取得今天的日期（格式：YYYY-MM-DD）
        const today = new Date().toISOString().split('T')[0];
        
        // 過濾出尚未結束的行程（結束日期 >= 今天）
        const upcomingTrips = trips.filter(t => t.endDate >= today);
        
        if (upcomingTrips.length === 0) {
            tripList.innerHTML = '<p class="empty-text">尚無確定的行程。</p>';
            return;
        }
        
        tripList.innerHTML = upcomingTrips.map(t => {
            const dayCount = Math.ceil((new Date(t.endDate) - new Date(t.startDate)) / (1000 * 60 * 60 * 24)) + 1;
            const daysLeft = Math.ceil((new Date(t.startDate) - new Date()) / (1000 * 60 * 60 * 24));
            
            return `
                <div class="trip-card wabi-card" onclick="location.href='trip-details.html?id=${t._id}'">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <strong style="font-size: 1.2rem; color: var(--accent-color);">${t.title}</strong>
                        ${daysLeft > 0 ? `
                            <span style="background: var(--clay); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem;">
                                還有 ${daysLeft} 天
                            </span>
                        ` : daysLeft === 0 ? `
                            <span style="background: var(--danger); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem;">
                                今天出發！
                            </span>
                        ` : ''}
                    </div>
                    
                    <div style="color: #666; margin: 8px 0;">
                        📅 ${formatDate(t.startDate)} ~ ${formatDate(t.endDate)} (${dayCount} 天)
                    </div>
                    
                    <div style="color: #666; margin: 8px 0;">
                        👥 ${t.participants.length} 位夥伴
                    </div>
                    
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #ddd; font-size: 0.85rem; color: #999;">
                        點擊查看詳情 →
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (e) {
        console.error("載入行程失敗:", e);
        tripList.innerHTML = '<p class="empty-text" style="color: var(--danger);">載入失敗</p>';
    }
}

// ===== 檢查通知 =====
async function checkNotifications() {
    try {
        const res = await fetch(`${API_URL}/api/notifications/${currentUser.nickname}`);
        const notifications = await res.json();
        
        if (notifications.length > 0) {
            // 可以在這裡加上通知提示
            console.log("你有", notifications.length, "個待處理的通知");
        }
    } catch (e) {
        console.error("檢查通知失敗:", e);
    }
}

// ===== 側邊選單控制 =====
function toggleMenu() {
    const menu = document.getElementById('side-menu');
    menu.classList.toggle('active');
}

// 點擊背景關閉選單
document.addEventListener('click', function(e) {
    const menu = document.getElementById('side-menu');
    const menuBtn = document.querySelector('.menu-btn');
    
    if (menu && menu.classList.contains('active')) {
        if (!menu.contains(e.target) && !menuBtn.contains(e.target)) {
            menu.classList.remove('active');
        }
    }
});

// ===== 登出功能 =====
function logout() {
    if (confirm("確定要登出嗎？")) {
        localStorage.removeItem('yashyash_user');
        location.href = 'login.html';
    }
}

// ===== 日期格式化工具 =====
function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekdays[date.getDay()];
    
    return `${year}/${month}/${day} (${weekday})`;
}

// ===== PWA Service Worker 註冊 =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('PWA Ready! Scope:', reg.scope))
            .catch(err => console.log('PWA Error:', err));
    });
}

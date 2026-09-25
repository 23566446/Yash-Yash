// main.js - 首頁核心功能
const API_URL = window.YashYashConfig.API_URL;
let currentUser = null;
if (!localStorage.getItem('yashyash_user') || !localStorage.getItem('yashyash_token')) { localStorage.removeItem('yashyash_user'); localStorage.removeItem('yashyash_token'); location.href = 'login.html'; }

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
        document.getElementById('side-user-avatar').src = window.safeImageSource(user.avatar, 'img/default-avatar.svg');
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
        const res = await apiFetch(`${API_URL}/api/proposals`);
        if (!res.ok) throw new Error('載入失敗');
        const proposals = await res.json();
        
        if (proposals.length === 0) {
            board.innerHTML = '<p class="empty-text">目前沒有公告中的行程提案。</p>';
            return;
        }
        
        board.replaceChildren();
        proposals.forEach(p => {
            const isCreator = p.creatorAccount === currentUser.account;
            const hasVoted = p.votes.includes(currentUser.account);
            const progress = Math.min((p.votes.length / p.min) * 100, 100);
            const isPending = p.status === 'pending';
            
            const card=document.createElement('div'); card.className='proposal-card wabi-card';
            const header=document.createElement('div'); header.style.cssText='display:flex;justify-content:space-between;align-items:start;margin-bottom:15px;';
            const title=document.createElement('strong'); title.style.cssText='font-size:1.1rem;color:var(--text-color);'; title.textContent=`${p.creator} 發起的旅行`; header.appendChild(title); card.appendChild(header);
            const date=document.createElement('div'); date.style.cssText='margin:12px 0;color:#666;'; date.textContent=`📅 ${formatDate(p.start)} ~ ${formatDate(p.end)}`; card.appendChild(date);
            const summary=document.createElement('div'); summary.style.cssText='background:var(--bg-color);padding:12px;border-radius:8px;margin:12px 0;'; const progressText=document.createElement('div'); progressText.style.cssText='font-weight:bold;color:var(--accent-color);'; progressText.textContent=`參加人數 ${p.votes.length} / ${p.min}`; const track=document.createElement('div'); track.style.cssText='background:#ddd;height:8px;border-radius:10px;overflow:hidden;'; const bar=document.createElement('div'); bar.style.cssText=`background:var(--accent-color);height:100%;width:${progress}%;transition:width .3s;`; track.appendChild(bar); summary.append(progressText,track); card.appendChild(summary);
            if(isPending){const pending=document.createElement('div');pending.style.cssText='background:#fff3cd;padding:10px;border-radius:8px;margin:10px 0;border-left:3px solid var(--clay);';const strong=document.createElement('strong');strong.textContent='🎉 人數已達標！';const small=document.createElement('small');small.textContent='等待發起人確認建立正式行程';pending.append(strong,document.createElement('br'),small);card.appendChild(pending);}
            const actions=document.createElement('div'); actions.style.cssText='display:flex;gap:8px;margin-top:15px;';
            if (isCreator) { const edit=document.createElement('button'); edit.className='btn-small'; edit.style.fontSize='.7rem'; edit.textContent='✏️ 編輯'; edit.addEventListener('click',()=>editProposal(p._id)); header.appendChild(edit); }
            const voteBtn=document.createElement('button'); voteBtn.className='btn-primary'; voteBtn.style.flex='1'; voteBtn.textContent=hasVoted?'✓ 已報名':'✋ 我要參加'; voteBtn.disabled=hasVoted; if(!hasVoted)voteBtn.addEventListener('click',()=>vote(p._id)); actions.appendChild(voteBtn);
            if(isCreator){const del=document.createElement('button');del.className='btn-small';del.style.cssText='color:var(--danger);border-color:var(--danger);';del.textContent='🗑️';del.addEventListener('click',()=>deleteProposal(p._id));actions.appendChild(del);} card.appendChild(actions); board.appendChild(card); });
        
    } catch (e) {
        console.error("載入提案失敗:", e);
        board.innerHTML = '<p class="empty-text" style="color: var(--danger);">載入失敗，請重新整理頁面</p>';
    }
}

// ===== 編輯提案功能 =====
async function editProposal(proposalId) {
    try {
        // 取得目前提案資料
        const res = await apiFetch(`${API_URL}/api/proposals`);
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
        const updateRes = await apiFetch(`${API_URL}/api/proposals/${proposalId}`, {
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
        const res = await apiFetch(`${API_URL}/api/proposals/vote`, {
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
        const res = await apiFetch(`${API_URL}/api/proposals/${proposalId}`, {
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
        const res = await apiFetch(`${API_URL}/api/my-trips`);
        if (!res.ok) throw new Error('載入失敗');
        const trips = await res.json();
        
        // 取得今天的日期（格式：YYYY-MM-DD）
        const today = new Date().toISOString().split('T')[0];
        
        // 過濾出尚未結束的行程（結束日期 >= 今天）
        const upcomingTrips = trips.filter(t => t.endDate >= today);
        
        if (upcomingTrips.length === 0) {
            tripList.innerHTML = '<p class="empty-text">尚無確定的行程。</p>';
            return;
        }
        
        tripList.replaceChildren();
        upcomingTrips.forEach(t => {
            const dayCount = Math.ceil((new Date(t.endDate) - new Date(t.startDate)) / (1000 * 60 * 60 * 24)) + 1;
            const daysLeft = Math.ceil((new Date(t.startDate) - new Date()) / (1000 * 60 * 60 * 24));
            
            const card=document.createElement('div'); card.className='trip-card wabi-card'; card.addEventListener('click',()=>{location.href=`trip-details.html?id=${encodeURIComponent(t._id)}`;});
            const title=document.createElement('strong'); title.style.cssText='font-size:1.2rem;color:var(--accent-color);'; title.textContent=t.title; card.appendChild(title);
            if(daysLeft>=0){const badge=document.createElement('span'); badge.style.cssText=`background:${daysLeft>0?'var(--clay)':'var(--danger)'};color:white;padding:4px 10px;border-radius:20px;font-size:.75rem;`; badge.textContent=daysLeft>0?`還有 ${daysLeft} 天`:'今天出發！'; card.appendChild(badge);}
            const date=document.createElement('div'); date.style.cssText='color:#666;margin:8px 0;'; date.textContent=`📅 ${formatDate(t.startDate)} ~ ${formatDate(t.endDate)} (${dayCount} 天)`; card.appendChild(date); const people=document.createElement('div');people.style.cssText='color:#666;margin:8px 0;';people.textContent=`👥 ${t.participants.length} 位夥伴`;card.appendChild(people);const footer=document.createElement('div');footer.style.cssText='margin-top:12px;padding-top:12px;border-top:1px dashed #ddd;font-size:.85rem;color:#999;';footer.textContent='點擊查看詳情 →';card.appendChild(footer);tripList.appendChild(card); });
        
    } catch (e) {
        console.error("載入行程失敗:", e);
        tripList.innerHTML = '<p class="empty-text" style="color: var(--danger);">載入失敗</p>';
    }
}

// ===== 檢查通知 =====
async function checkNotifications() {
    try {
        const res = await apiFetch(`${API_URL}/api/notifications`);
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
        localStorage.removeItem('yashyash_token');
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


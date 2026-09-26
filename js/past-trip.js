const API_URL = window.YashYashConfig.API_URL;
let currentUser = null;
document.getElementById('menu-logout').addEventListener('click', logout);

window.onload = async () => {
    currentUser = await window.YashYashSession.ready;
    // 初始化選單使用者資訊
    if (currentUser.avatar) {
        document.getElementById('side-user-avatar').src = window.safeImageSource(currentUser.avatar, 'img/default-avatar.svg');
    }
    document.getElementById('side-display-name').innerText = currentUser.nickname;
    
    loadPastTrips();
};

async function loadPastTrips() {
    try {
        const response = await apiFetch(`${API_URL}/api/my-trips`);
        const trips = await response.json();
        const pastList = document.getElementById('past-trip-list');
        
        // 取得今天的日期
        const today = new Date().toISOString().split('T')[0];

        // 過濾出結束日期小於今天的行程
        const pastTrips = trips.filter(t => t.endDate < today);

        if (pastTrips.length === 0) {
            pastList.innerHTML = '<p class="empty-text">目前尚無已結束的行程紀錄。</p>';
            return;
        }

        pastList.replaceChildren();
        pastTrips.forEach(t => { const card=document.createElement('div'); card.className='trip-card wabi-card past-card'; card.style.cursor='pointer'; card.addEventListener('click',()=>{location.href=`trip-details.html?id=${encodeURIComponent(t._id)}`;}); const head=document.createElement('div'); head.style.cssText='display:flex;justify-content:space-between;'; const title=document.createElement('h4'); title.style.margin='0'; title.textContent=t.title; const done=document.createElement('span'); done.style.cssText='font-size:10px;color:#aaa;border:1px solid #ddd;padding:2px 5px;border-radius:3px;'; done.textContent='已結束'; head.append(title,done); const date=document.createElement('p'); date.style.cssText='font-size:0.85rem;color:#888;margin-top:10px;'; date.textContent=`📅 ${t.startDate} ~ ${t.endDate}`; const people=document.createElement('div'); people.style.cssText='font-size:0.75rem;color:var(--clay);margin-top:10px;'; people.textContent=`👤 參與夥伴：${t.participants.length} 人`; card.append(head,date,people); pastList.appendChild(card); });

    } catch (err) {
        console.error("載入過去行程失敗", err);
        document.getElementById('past-trip-list').innerHTML = '<p class="empty-text">載入失敗，請檢查網路連線。</p>';
    }
}

// 側邊選單功能
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

function logout() {
    localStorage.removeItem('yashyash_user');
    localStorage.removeItem('yashyash_token');
    window.location.href = 'login.html';
}


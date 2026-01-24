const API_URL = 'https://yash-yash.onrender.com';
const userData = localStorage.getItem('yashyash_user');
if (!userData) { window.location.href = 'login.html'; }
const currentUser = JSON.parse(userData);

window.onload = () => {
    // 初始化選單使用者資訊
    if (currentUser.avatar) {
        document.getElementById('side-user-avatar').src = currentUser.avatar;
    }
    document.getElementById('side-display-name').innerText = currentUser.nickname;
    
    loadPastTrips();
};

async function loadPastTrips() {
    try {
        const response = await fetch(`${API_URL}/api/my-trips/${currentUser.account}`);
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

        pastList.innerHTML = pastTrips.map(t => `
            <div class="trip-card wabi-card past-card" onclick="location.href='trip-details.html?id=${t._id}'" style="cursor:pointer;">
                <div style="display:flex; justify-content:space-between;">
                    <h4 style="margin:0;">${t.title}</h4>
                    <span style="font-size:10px; color:#aaa; border:1px solid #ddd; padding:2px 5px; border-radius:3px;">已結束</span>
                </div>
                <p style="font-size:0.85rem; color:#888; margin-top:10px;">📅 ${t.startDate} ~ ${t.endDate}</p>
                <div style="font-size:0.75rem; color:var(--clay); margin-top:10px;">👤 參與夥伴：${t.participants.length} 人</div>
            </div>
        `).join('');

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
    window.location.href = 'login.html';
}
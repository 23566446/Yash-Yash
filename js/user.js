const API_URL = 'https://yash-yash.onrender.com';

// 確保每次進入頁面都從 localStorage 取得最新資料
const userData = localStorage.getItem('yashyash_user');
if (!userData) {
    window.location.href = 'login.html';
}
let currentUser = JSON.parse(userData);

window.onload = () => {
    initPage();
};

function initPage() {
    // 1. 介面文字初始化
    document.getElementById('header-nickname').innerText = `${currentUser.nickname} 的後台`;
    document.getElementById('display-account').innerText = currentUser.account;
    document.getElementById('edit-nick').value = currentUser.nickname;
    document.getElementById('edit-gen').value = currentUser.gender || 'male';

    // 2. 檢查是否有需要確認的通知
    checkNotifications();

    // 3. 超級管理員檢查
    if (currentUser.account === 'admin') {
        document.getElementById('super-user-section').classList.remove('hidden');
        loadAllUsers();
    }
}

// --- 核心功能：檢查通知 ---
async function checkNotifications() {
    try {
        console.log("正在檢查通知...");
        const response = await fetch(`${API_URL}/api/notifications/${currentUser.nickname}`);
        const pendings = await response.json();
        const section = document.getElementById('notification-section');
        const list = document.getElementById('notification-list');

        if (pendings && pendings.length > 0) {
            section.classList.remove('hidden');
            list.innerHTML = pendings.map(p => `
                <div class="notif-item" id="notif-${p._id}" style="padding: 15px; border-bottom: 1px dashed #d2b48c;">
                    <p style="margin:0 0 10px 0;"><strong>活動達標：</strong>${p.start} ~ ${p.end}</p>
                    <div style="display:flex; gap:10px;">
                        <button onclick="handleTripDecision('${p._id}', 'confirm')" class="btn-primary" style="padding:5px 15px; font-size:0.8rem;">確認建立</button>
                        <button onclick="handleTripDecision('${p._id}', 'cancel')" class="btn-text" style="color:#999; text-decoration:none;">取消</button>
                    </div>
                </div>
            `).join('');
        } else {
            section.classList.add('hidden');
        }
    } catch (err) {
        console.error("檢查通知失敗", err);
    }
}

// --- 核心功能：處理確認建立 (修正 Reload 問題) ---
async function handleTripDecision(id, action) {
    let title = "";
    if (action === 'confirm') {
        title = prompt("請輸入旅行名稱：", "我們的旅行");
        if (!title) return; // 使用者按取消
    }

    try {
        const response = await fetch(`${API_URL}/api/trips/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                proposalId: id, 
                action: action, 
                title: title 
            })
        });

        const result = await response.json();

        if (response.ok) {
            alert(action === 'confirm' ? "🎉 行程建立成功！" : "已取消行程");
            location.reload();
        } else {
            // --- 重點：如果後端回傳 400 (名稱重複)，彈出錯誤訊息 ---
            alert("建立失敗：" + result.message);
            
            // 如果是因為名稱重複，可以選擇重新呼叫此函數讓使用者再試一次
            if (result.message.includes("名稱")) {
                handleTripDecision(id, action); 
            }
        }
    } catch (err) {
        alert("連線後端伺服器時發生錯誤，請檢查後端是否啟動。");
    }
}

// --- 修改個人資料 ---
async function updateMyInfo() {
    const newNick = document.getElementById('edit-nick').value;
    const newPw = document.getElementById('edit-pw').value;
    const newGen = document.getElementById('edit-gen').value;

    try {
        const response = await fetch(`${API_URL}/api/users/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser._id,
                nickname: newNick,
                password: newPw,
                gender: newGen
            })
        });

        const result = await response.json();

        if (response.ok) {
            if (result.logoutRequired) {
                alert("密碼已變更，請重新登入！");
                logout();
                return;
            }
            localStorage.setItem('yashyash_user', JSON.stringify(result.user));
            alert("個人資料更新成功");
            location.reload();
        }
    } catch (err) {
        alert("更新失敗");
    }
}

// --- 超級管理員功能 ---
async function loadAllUsers() {
    try {
        const response = await fetch(`${API_URL}/api/admin/users`);
        const users = await response.json();
        const listContainer = document.getElementById('all-users-list');
        listContainer.innerHTML = users.map(u => `
            <div class="user-item-row">
                <div class="user-info-text">
                    <strong>${u.nickname}</strong>
                    <span>帳號: ${u.account}</span>
                </div>
                <div class="user-actions">
                    <button onclick="adminResetPassword('${u._id}', '${u.nickname}')" class="btn-small">改密碼</button>
                    ${u.account !== 'admin' ? `<button onclick="deleteUser('${u._id}')" class="btn-small" style="color:red;">移除</button>` : ''}
                </div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

async function adminResetPassword(targetId, targetNick) {
    const newPw = prompt(`重設 ${targetNick} 的密碼：`);
    if (!newPw) return;
    const response = await fetch(`${API_URL}/api/admin/reset-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetId, newPassword: newPw })
    });
    if (response.ok) alert("密碼重設成功");
}

async function deleteUser(id) {
    if (!confirm("確定移除使用者？")) return;
    const response = await fetch(`${API_URL}/api/admin/users/${id}`, { method: 'DELETE' });
    if (response.ok) { alert("已移除"); loadAllUsers(); }
}

function logout() {
    localStorage.removeItem('yashyash_user');
    window.location.href = 'login.html';

}

const API_URL = 'https://yash-yash.onrender.com';
const userData = localStorage.getItem('yashyash_user');
if (!userData) { window.location.href = 'login.html'; }
let currentUser = JSON.parse(userData);
let currentAvatarBase64 = currentUser.avatar || "";
let isUploadingAvatar = false;

window.onload = () => { initPage(); };

function initPage() {
    document.getElementById('header-nickname').innerText = `${currentUser.nickname} 的後台`;
    document.getElementById('display-account').innerText = currentUser.account;
    document.getElementById('edit-nick').value = currentUser.nickname;
    document.getElementById('edit-gen').value = currentUser.gender || 'male';
    if (currentUser.avatar) { document.getElementById('avatar-preview').src = currentUser.avatar; }

    checkNotifications();

    const isSuperAdmin = (currentUser.account === 'admin' || currentUser.role === 'admin');
    const isManager = (currentUser.role === 'manager');

    // Admin 與 Manager 都能看到管理清單
    if (isSuperAdmin || isManager) {
        document.getElementById('super-user-section').classList.remove('hidden');
        loadAllUsers(isSuperAdmin); 
    }

    // 只有真正的 Super Admin 才能管理金鑰
    const licenseBtn = document.querySelector("button[onclick*='license-manager.html']");
    if (licenseBtn) {
        licenseBtn.style.display = isSuperAdmin ? 'block' : 'none';
    }
}

async function loadAllUsers(isSuperAdmin) {
    try {
        const response = await fetch(`${API_URL}/api/admin/users`);
        const users = await response.json();
        const listContainer = document.getElementById('all-users-list');
        
        listContainer.innerHTML = users.map(u => {
            // 1. 隱藏自己
            if (u.account === currentUser.account) return ""; 

            // 2. 核心修正：如果目標是 admin (超級管理員)，且目前登入者不是超級管理員，則隱藏該筆資料
            const isTargetAdmin = (u.account === 'admin' || u.role === 'admin');
            if (isTargetAdmin && !isSuperAdmin) return "";

            return `
                <div class="user-item-row" style="padding: 15px; background: #fff; margin-bottom: 10px; border-radius: 12px; border: 1px solid #eee;">
                    <div class="user-info-text">
                        <strong style="font-size: 1.1rem;">${u.nickname}</strong>
                        <span style="color: #888; font-size: 0.85rem;">帳號: ${u.account} (${u.role})</span>
                    </div>
                    <div class="user-actions" style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <button onclick="adminResetPassword('${u._id}', '${u.nickname}')" class="btn-small">改密碼</button>
                        ${isSuperAdmin ? `
                            <button onclick="changeRole('${u._id}', '${u.role === 'manager' ? 'user' : 'manager'}')" class="btn-small">${u.role === 'manager' ? '設為一般使用者' : '設為管理員'}</button>
                            <button onclick="deleteUser('${u._id}')" class="btn-small" style="color:red; border-color:red;">刪除</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) { console.error("載入使用者列表失敗:", err); }
}

async function changeRole(id, newRole) {
    const res = await fetch(`${API_URL}/api/admin/change-role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: id, newRole })
    });
    if (res.ok) { alert("權限更新成功！"); location.reload(); }
}

async function updateMyInfo() {
    const newNick = document.getElementById('edit-nick').value;
    const newPw = document.getElementById('edit-pw').value;
    const newGen = document.getElementById('edit-gen').value;
    if (!newNick) return alert("暱稱不能為空");

    try {
        const response = await fetch(`${API_URL}/api/users/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser._id, nickname: newNick, password: newPw, gender: newGen, avatar: currentAvatarBase64 })
        });
        const result = await response.json();
        if (response.ok) {
            if (result.logoutRequired) { alert("密碼已變更，請重新登入！"); logout(); return; }
            alert("個人資料更新成功！");
            localStorage.setItem('yashyash_user', JSON.stringify(result.user));
            location.reload();
        }
    } catch (err) { alert("連線失敗"); }
}

async function checkNotifications() {
    const res = await fetch(`${API_URL}/api/notifications/${currentUser.nickname}`);
    const pendings = await res.json();
    const section = document.getElementById('notification-section');
    if (pendings.length > 0) {
        section.classList.remove('hidden');
        document.getElementById('notification-list').innerHTML = pendings.map(p => `
            <div class="notif-item" id="notif-${p._id}" style="padding:15px; border-bottom:1px dashed #d2b48c;">
                <p><strong>活動達標：</strong>${p.start} ~ ${p.end}</p>
                <button onclick="handleTripDecision('${p._id}', 'confirm')" class="btn-primary">確認建立</button>
                <button onclick="handleTripDecision('${p._id}', 'cancel')" class="btn-text">取消</button>
            </div>
        `).join('');
    }
}

async function handleTripDecision(id, action) {
    let title = "";
    if (action === 'confirm') {
        title = prompt("請輸入旅行名稱：", "我們的旅行");
        if (!title) return;
    }
    const response = await fetch(`${API_URL}/api/trips/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: id, action, title })
    });
    const result = await response.json();
    if (response.ok) {
        alert(action === 'confirm' ? "🎉 行程建立成功！" : "已取消行程");
        location.reload();
    } else {
        alert("建立失敗：" + result.message);
        if (result.message.includes("名稱")) handleTripDecision(id, action);
    }
}

async function adminResetPassword(id, nick) {
    const newPassword = prompt(`請輸入「${nick}」的新密碼:`);
    if (!newPassword) return;
    await fetch(`${API_URL}/api/admin/reset-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: id, newPassword })
    });
    alert(`已成功將 ${nick} 的密碼重設！`);
}

async function deleteUser(id) {
    if (!confirm("確定要永久移除此使用者嗎？")) return;
    const response = await fetch(`${API_URL}/api/admin/users/${id}`, { method: 'DELETE' });
    if (response.ok) { alert("已移除使用者"); loadAllUsers(true); }
}

// 在 initPage 內呼叫，載入目前的跑馬燈內容到輸入框
async function loadMarqueeSetting() {
    const res = await fetch(`${API_URL}/api/settings/marquee`);
    const data = await res.json();
    const input = document.getElementById('marquee-input');
    if(input) input.value = data.text;
}

// 管理員更新跑馬燈
async function updateMarquee() {
    const text = document.getElementById('marquee-input').value;
    if(!text) return alert("請輸入公告內容");

    const res = await fetch(`${API_URL}/api/settings/marquee`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    });

    if (res.ok) {
        alert("公告已更新，首頁將會即時顯示！");
    }
}

function previewAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) return alert("圖片太大了！請上傳小於 5MB 的圖片。");
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;
            document.getElementById('avatar-preview').src = base64;
            currentAvatarBase64 = base64;
            // 圖片選取成功後，直接自動更新到資料庫（不需再按「更新資料」）
            updateAvatarOnly(base64);
        };
        reader.readAsDataURL(file);
    }
}

async function updateAvatarOnly(avatarBase64) {
    if (isUploadingAvatar) return;
    isUploadingAvatar = true;

    // 以目前輸入框為準，避免把使用者剛改的暱稱/性別覆蓋掉
    const nicknameInput = document.getElementById('edit-nick');
    const genderInput = document.getElementById('edit-gen');
    const nickname = (nicknameInput?.value || currentUser.nickname || "").trim();
    const gender = genderInput?.value || currentUser.gender || 'male';

    if (!nickname) {
        isUploadingAvatar = false;
        return alert("暱稱不能為空（請先填寫暱稱再上傳頭像）");
    }

    try {
        const response = await fetch(`${API_URL}/api/users/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser._id,
                nickname,
                gender,
                avatar: avatarBase64
            })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result?.message || "頭像更新失敗");
        }

        // 同步本機登入資訊，讓聊天室等頁面立即吃到新頭像
        if (result.user) {
            currentUser = result.user;
            currentAvatarBase64 = result.user.avatar || avatarBase64;
            localStorage.setItem('yashyash_user', JSON.stringify(result.user));
        }
    } catch (err) {
        alert(err?.message || "連線失敗");
    } finally {
        isUploadingAvatar = false;
    }
}

function logout() { localStorage.removeItem('yashyash_user'); window.location.href = 'login.html'; }
const API_URL = 'https://yash-yash.onrender.com';
const userData = localStorage.getItem('yashyash_user');
if (!userData) { window.location.href = 'login.html'; }
let currentUser = JSON.parse(userData);
let currentAvatarBase64 = currentUser.avatar || "";

window.onload = () => { initPage(); };

function initPage() {
    document.getElementById('header-nickname').innerText = `${currentUser.nickname} 的後台`;
    document.getElementById('display-account').innerText = currentUser.account;
    document.getElementById('edit-nick').value = currentUser.nickname;
    document.getElementById('edit-gen').value = currentUser.gender || 'male';
    if (currentUser.avatar) document.getElementById('avatar-preview').src = currentUser.avatar;

    checkNotifications();

    const isSuper = (currentUser.account === 'admin' || currentUser.role === 'admin');
    const isManager = (currentUser.role === 'manager');

    if (isSuper || isManager) {
        document.getElementById('super-user-section').classList.remove('hidden');
        loadAllUsers(isSuper);
        loadMarqueeSetting();
    }

    const libtn = document.querySelector("button[onclick*='license-manager.html']");
    if (libtn) libtn.style.display = isSuper ? 'block' : 'none';
}

async function loadAllUsers(isSuper) {
    const res = await fetch(`${API_URL}/api/admin/users`);
    const users = await res.json();
    const list = document.getElementById('all-users-list');
    list.innerHTML = users.map(u => {
        if (u.account === currentUser.account) return "";
        if (!isSuper && (u.role === 'admin' || u.account === 'admin')) return "";
        return `
            <div class="user-item-row" style="border-left:3px solid ${u.role==='manager'?'#8a9a5b':'#eee'};">
                <div class="user-info-text"><strong>${u.nickname} <small>(${u.role})</small></strong><span>${u.account}</span></div>
                <div class="user-actions">
                    <button onclick="adminResetPassword('${u._id}', '${u.nickname}')" class="btn-small">改密</button>
                    ${isSuper ? `<button onclick="changeRole('${u._id}', '${u.role==='manager'?'user':'manager'}')" class="btn-small">權限</button>
                    <button onclick="deleteUser('${u._id}')" class="btn-small" style="color:red;">移除</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
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
    await fetch(`${API_URL}/api/settings/marquee`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ text })
    });
    alert("公告已更新，首頁將會即時顯示！");
}

function previewAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 512 * 1024) return alert("圖片太大了！請上傳小於 500KB 的圖片。");
        const reader = new FileReader();
        reader.onload = (e) => { document.getElementById('avatar-preview').src = e.target.result; currentAvatarBase64 = e.target.result; };
        reader.readAsDataURL(file);
    }
}

function logout() { localStorage.removeItem('yashyash_user'); window.location.href = 'login.html'; }
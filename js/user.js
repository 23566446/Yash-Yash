const API_URL = window.YashYashConfig.API_URL;
let currentUser = null;
const realtimeProposalNotifications = new Set();
let currentAvatarBase64 = "";
let isUploadingAvatar = false;

window.onload = () => {
    window.YashYashSession.ready.then(user => {
        currentUser = user;
        currentAvatarBase64 = user.avatar || '';
        initPage();
    });
};

function initPage() {
    document.getElementById('header-nickname').textContent = `${currentUser.nickname} 的後台`;
    document.getElementById('display-account').textContent = currentUser.account;
    document.getElementById('edit-nick').value = currentUser.nickname;
    document.getElementById('edit-gen').value = currentUser.gender || 'male';
    if (currentUser.avatar) { document.getElementById('avatar-preview').src = window.safeImageSource(currentUser.avatar, 'img/default-avatar.svg'); }

    checkNotifications();
    initializeNotificationRealtime();

    const isSuperAdmin = currentUser.role === 'admin';

    if (isSuperAdmin) {
        document.getElementById('super-user-section').classList.remove('hidden');
        document.getElementById('marquee-admin-section').classList.remove('hidden');
        loadAllUsers(isSuperAdmin); 
        loadMarqueeSetting();
    }

    // 只有真正的 Super Admin 才能管理金鑰
    const licenseBtn = document.querySelector("button[onclick*='license-manager.html']");
    if (licenseBtn) {
        licenseBtn.style.display = isSuperAdmin ? 'block' : 'none';
    }
}

async function loadAllUsers(isSuperAdmin) {
    const listContainer = document.getElementById('all-users-list');
    try {
        const response = await apiFetch(`${API_URL}/api/admin/users`);
        if (!response.ok) {
            const errorMessage = document.createElement('p');
            errorMessage.className = 'empty-text';
            errorMessage.textContent = '載入成員名單失敗，請稍後再試。';
            listContainer.replaceChildren(errorMessage);
            return;
        }

        const users = await response.json();
        if (!Array.isArray(users)) {
            const errorMessage = document.createElement('p');
            errorMessage.className = 'empty-text';
            errorMessage.textContent = '載入成員名單失敗，請稍後再試。';
            listContainer.replaceChildren(errorMessage);
            return;
        }

        const userRows = [];
        users.forEach(u => {
            if (u.account === currentUser.account) return;

            const isTargetAdmin = (u.account === 'admin' || u.role === 'admin');
            if (isTargetAdmin && !isSuperAdmin) return;

            const row = document.createElement('div');
            row.className = 'user-item-row';
            row.style.cssText = 'padding: 15px; background: #fff; margin-bottom: 10px; border-radius: 12px; border: 1px solid #eee;';

            const info = document.createElement('div');
            info.className = 'user-info-text';
            const nickname = document.createElement('strong');
            nickname.style.fontSize = '1.1rem';
            nickname.textContent = u.nickname;
            const account = document.createElement('span');
            account.style.cssText = 'color: #888; font-size: 0.85rem;';
            account.textContent = `帳號: ${u.account} (${u.role})`;
            info.append(nickname, account);

            const actions = document.createElement('div');
            actions.className = 'user-actions';
            actions.style.cssText = 'margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;';
            const resetButton = document.createElement('button');
            resetButton.className = 'btn-small';
            resetButton.textContent = '改密碼';
            resetButton.addEventListener('click', () => adminResetPassword(u._id, u.nickname));
            actions.appendChild(resetButton);

            if (isSuperAdmin) {
                const roleButton = document.createElement('button');
                roleButton.className = 'btn-small';
                roleButton.textContent = u.role === 'admin' ? '設為一般使用者' : '設為管理員';
                roleButton.addEventListener('click', () => changeRole(u._id, u.role === 'admin' ? 'user' : 'admin'));

                const deleteButton = document.createElement('button');
                deleteButton.className = 'btn-small';
                deleteButton.style.cssText = 'color:red; border-color:red;';
                deleteButton.textContent = '刪除';
                deleteButton.addEventListener('click', () => deleteUser(u._id));
                actions.append(roleButton, deleteButton);
            }

            row.append(info, actions);
            userRows.push(row);
        });
        listContainer.replaceChildren(...userRows);
    } catch (err) {
        console.error("載入使用者列表失敗:", err);
        const errorMessage = document.createElement('p');
        errorMessage.className = 'empty-text';
        errorMessage.textContent = '載入成員名單失敗，請稍後再試。';
        listContainer.replaceChildren(errorMessage);
    }
}

async function changeRole(id, newRole) {
    const res = await apiFetch(`${API_URL}/api/admin/change-role`, {
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
        const response = await apiFetch(`${API_URL}/api/users/update`, {
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
    const section = document.getElementById('notification-section');
    const listContainer = document.getElementById('notification-list');
    section.classList.add('hidden');
    listContainer.replaceChildren();

    try {
        const res = await apiFetch(`${API_URL}/api/notifications`);
        if (!res.ok) return;

        const pendings = await res.json();
        if (!Array.isArray(pendings) || pendings.length === 0) return;

        const notifications = pendings.map(p => {
            const item = document.createElement('div');
            item.className = 'notif-item';
            item.style.cssText = 'padding:15px; border-bottom:1px dashed #d2b48c;';

            const message = document.createElement('p');
            const label = document.createElement('strong');
            label.textContent = '活動達標：';
            const dates = document.createElement('span');
            dates.textContent = `${p.start} ~ ${p.end}`;
            message.append(label, dates);

            const confirmButton = document.createElement('button');
            confirmButton.className = 'btn-primary';
            confirmButton.textContent = '確認建立';
            confirmButton.addEventListener('click', () => handleTripDecision(p._id, 'confirm'));

            const cancelButton = document.createElement('button');
            cancelButton.className = 'btn-text';
            cancelButton.textContent = '取消';
            cancelButton.addEventListener('click', () => handleTripDecision(p._id, 'cancel'));

            item.append(message, confirmButton, cancelButton);
            return item;
        });

        listContainer.replaceChildren(...notifications);
        section.classList.remove('hidden');
    } catch (err) {
        console.error('載入通知失敗:', err);
    }
}

function handleProposalPendingNotification(event) {
    const proposalId = event?.proposalId;
    if (!proposalId || realtimeProposalNotifications.has(proposalId)) return;
    realtimeProposalNotifications.add(proposalId);
    checkNotifications();
    window.showToast?.('旅遊提案已達成最低參加人數');
}

function refreshNotificationsOnConnect() {
    checkNotifications();
}

async function initializeNotificationRealtime() {
    if (!window.YashYashRealtime) return;
    window.YashYashRealtime.on('notification:proposal-pending', handleProposalPendingNotification);
    window.YashYashRealtime.on('connect', refreshNotificationsOnConnect);
    try { await window.YashYashRealtime.connect(); } catch (error) { /* Existing REST notifications remain available */ }
}

async function handleTripDecision(id, action) {
    let title = "";
    if (action === 'confirm') {
        title = prompt("請輸入旅行名稱：", "我們的旅行");
        if (!title) return;
    }
    const response = await apiFetch(`${API_URL}/api/trips/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: id, action, title })
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
        alert(action === 'confirm' ? "🎉 行程建立成功！" : "已取消行程");
        location.reload();
    } else {
        const message = typeof result.message === 'string' ? result.message : '伺服器錯誤';
        alert("建立失敗：" + message);
        if (message.includes("名稱")) handleTripDecision(id, action);
    }
}

async function adminResetPassword(id, nick) {
    const newPassword = prompt(`請輸入「${nick}」的新密碼:`);
    if (newPassword === null) return;
    if (newPassword.length === 0) return alert("密碼不能為空");
    const response = await apiFetch(`${API_URL}/api/admin/reset-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: id, newPassword })
    });
    if (response.ok) alert(`已成功將 ${nick} 的密碼重設！`);
    else {
        const result = await response.json().catch(() => ({}));
        alert(`密碼重設失敗：${result.message || '伺服器錯誤'}`);
    }
}

async function deleteUser(id) {
    if (!confirm("確定要永久移除此使用者嗎？")) return;
    const response = await apiFetch(`${API_URL}/api/admin/users/${id}`, { method: 'DELETE' });
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

    const res = await apiFetch(`${API_URL}/api/settings/marquee`, {
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
            const safePreview = window.safeImageSource(base64, '');
            if (!safePreview) return alert('不支援的圖片格式');
            document.getElementById('avatar-preview').src = safePreview;
            currentAvatarBase64 = safePreview;
            // 圖片選取成功後，直接自動更新到資料庫（不需再按「更新資料」）
            updateAvatarOnly(safePreview);
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
        const response = await apiFetch(`${API_URL}/api/users/update`, {
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

function logout() {
    localStorage.removeItem('yashyash_user');
    localStorage.removeItem('yashyash_token');
    window.location.href = 'login.html';
}


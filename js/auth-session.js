(function () {
    const token = localStorage.getItem('yashyash_token');
    let resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });

    function clearAuthAndRedirect() {
        localStorage.removeItem('yashyash_token');
        localStorage.removeItem('yashyash_user');
        window.location.replace('login.html');
    }

    function showConnectionState() {
        let panel = document.getElementById('auth-connection-state');
        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'auth-connection-state';
            panel.className = 'auth-connection-state';
            panel.setAttribute('role', 'status');
            const title = document.createElement('h2');
            title.textContent = '暫時無法確認登入狀態';
            const text = document.createElement('p');
            text.textContent = '伺服器可能正在啟動，請稍後重新連線。';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'btn-primary';
            retry.textContent = '重新連線';
            retry.addEventListener('click', verifySession);
            panel.append(title, text, retry);
            document.body.appendChild(panel);
        }
        panel.hidden = false;
    }

    async function verifySession() {
        if (!token) return clearAuthAndRedirect();
        const panel = document.getElementById('auth-connection-state');
        if (panel) panel.hidden = true;
        try {
            const response = await fetch(`${window.YashYashConfig.API_URL}/api/session`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.status === 401) return clearAuthAndRedirect();
            if (!response.ok) throw new Error('SESSION_UNAVAILABLE');
            const user = await response.json();
            window.currentAuthenticatedUser = user;
            localStorage.setItem('yashyash_user', JSON.stringify(user));
            document.body.classList.remove('auth-pending');
            resolveReady(user);
            window.dispatchEvent(new CustomEvent('yashyash:session-ready', { detail: user }));
        } catch (error) {
            showConnectionState();
        }
    }

    window.YashYashSession = { ready, verify: verifySession, clear: clearAuthAndRedirect };
    verifySession();
}());

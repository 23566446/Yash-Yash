const API_URL = window.YashYashConfig.API_URL;
const HEALTH_RETRY_DELAYS = [0, 3000, 6000, 10000, 15000];
let backendReady = false;
let readinessRequest = null;

function updateServerStatus(message, showRetry = false) {
    const status = document.getElementById('server-status');
    const retryButton = document.getElementById('retry-server-btn');
    if (status) status.textContent = message;
    if (retryButton) retryButton.classList.toggle('hidden', !showRetry);
}

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function wakeBackend() {
    if (readinessRequest) return readinessRequest;

    const loginButton = document.getElementById('login-btn');
    if (loginButton) loginButton.disabled = true;
    updateServerStatus('正在連線伺服器…');

    readinessRequest = (async () => {
        for (let attempt = 0; attempt < HEALTH_RETRY_DELAYS.length; attempt += 1) {
            if (attempt > 0) {
                updateServerStatus('正在啟動伺服器…');
                await wait(HEALTH_RETRY_DELAYS[attempt]);
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch(`${API_URL}/api/health`, { signal: controller.signal });
                if (response.ok) {
                    backendReady = true;
                    updateServerStatus('伺服器已連線');
                    if (loginButton) loginButton.disabled = false;
                    return true;
                }
            } catch (error) {
                console.info('Backend is still waking up');
            } finally {
                clearTimeout(timeout);
            }
        }

        updateServerStatus('暫時無法連線伺服器', true);
        return false;
    })();

    try {
        return await readinessRequest;
    } finally {
        readinessRequest = null;
    }
}

if (document.getElementById('acc')) {
    document.getElementById('retry-server-btn')?.addEventListener('click', wakeBackend);
    wakeBackend();
}

// --- 註冊功能 ---
async function register() {
    const account = document.getElementById('reg-acc').value;
    const password = document.getElementById('reg-pw').value;
    const nickname = document.getElementById('reg-nick').value;
    const gender = document.getElementById('reg-gen').value;
    const licenseKey = document.getElementById('reg-license').value; // 新增這行

    if (!account || !password || !nickname || !licenseKey) {
        return alert("請填寫所有欄位，包含許可證金鑰");
    }

    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                account, password, nickname, gender, 
                licenseKey: licenseKey.trim() // 傳送金鑰
            })
        });

        const data = await response.json();

        if (response.ok) {
            alert("註冊成功！");
            localStorage.setItem('yashyash_user', JSON.stringify(data.user));
            localStorage.setItem('yashyash_token', data.token);
            window.location.href = 'index.html';
        } else {
            alert(data.message); // 這裡會顯示「無效的金鑰」或「使用次數已滿」
        }
    } catch (err) {
        alert("伺服器連線失敗");
    }
}

// --- 登入功能 ---
async function login() {
    const account = document.getElementById('acc').value;
    const password = document.getElementById('pw').value;

    if (!account || !password) return alert("請輸入帳號密碼");

    if (!backendReady && !await wakeBackend()) return;

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account, password })
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            localStorage.setItem('yashyash_user', JSON.stringify(data.user));
            localStorage.setItem('yashyash_token', data.token);
            window.location.href = 'index.html';
        } else {
            alert(data.message || "登入失敗，請稍後再試");
        }
    } catch (err) {
        alert("伺服器連線失敗");
    }
}


const API_URL = 'https://yash-yash.onrender.com';

// --- 註冊功能 ---
async function register() {
    const account = document.getElementById('reg-acc').value;
    const password = document.getElementById('reg-pw').value;
    const nickname = document.getElementById('reg-nick').value;
    const gender = document.getElementById('reg-gen').value;

    if (!account || !password || !nickname) {
        return alert("請填寫所有欄位");
    }

    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account, password, nickname, gender })
        });

        const data = await response.json();

        if (response.ok) {
            alert("註冊成功！將為您自動登入");
            // 規格書要求：註冊成功後自動登入並跳轉
            localStorage.setItem('yashyash_user', JSON.stringify(data.user));
            window.location.href = 'index.html';
        } else {
            alert(data.message); // 例如：帳號已存在
        }
    } catch (err) {
        alert("伺服器連線失敗，請檢查後端是否啟動");
    }
}

// --- 登入功能 ---
async function login() {
    const account = document.getElementById('acc').value;
    const password = document.getElementById('pw').value;

    if (!account || !password) return alert("請輸入帳號密碼");

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('yashyash_user', JSON.stringify(data.user));
            window.location.href = 'index.html';
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert("伺服器連線失敗");
    }

}

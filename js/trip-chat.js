const API_URL = 'https://yash-yash.onrender.com';
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');

const userData = localStorage.getItem('yashyash_user');
const currentUser = JSON.parse(userData);

let lastMessageCount = 0;
let tripExpired = false;

window.onload = async () => {
    if (!tripId || !currentUser) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('back-to-details').onclick = () => {
        window.location.href = `trip-details.html?id=${tripId}`;
    };

    await fetchTripInfo();
    fetchMessages();
    setInterval(fetchMessages, 3000);
};

async function fetchTripInfo() {
    const res = await fetch(`${API_URL}/api/trips/${tripId}`);
    const trip = await res.json();
    document.getElementById('chat-trip-title').innerText = trip.title;
    const today = new Date().toISOString().split('T')[0];
    const end = (trip.endDate || '').split('T')[0];
    tripExpired = !!end && end < today;
    const inputArea = document.querySelector('.chat-input-area');
    if (inputArea) inputArea.style.display = tripExpired ? 'none' : '';
}

async function fetchMessages() {
    try {
        const res = await fetch(`${API_URL}/api/trips/${tripId}/chat`);
        const messages = await res.json();

        // 只有在訊息數量有變時才重新渲染，避免閃爍
        if (messages.length !== lastMessageCount) {
            renderMessages(messages);
            lastMessageCount = messages.length;
            scrollToBottom();
        }
    } catch (e) { console.error("訊息獲取失敗"); }
}

function renderMessages(messages) {
    const windowEl = document.getElementById('chat-window');
    if (messages.length === 0) {
        windowEl.innerHTML = '<p class="empty-text">這裡還沒有訊息，開始聊天吧！</p>';
        return;
    }

    windowEl.innerHTML = messages.map(m => {
        const isMe = m.sender === currentUser.nickname;
        const timeStr = new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const avatarSrc = m.avatar || 'img/default-avatar.png';

        return `
            <div class="msg ${isMe ? 'me' : 'others'}">
                <img src="${avatarSrc}" class="msg-avatar">
                <div>
                    <div style="font-size: 0.7rem; color: #888; margin-bottom: 2px;">${m.sender}</div>
                    <div class="msg-content">${m.text}</div>
                    <div class="msg-info">${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');
}

async function handleSend(e) {
    e.preventDefault();
    if (tripExpired) return;
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;

    const payload = {
        sender: currentUser.nickname,
        avatar: currentUser.avatar,
        text: text
    };

    input.value = ""; // 立即清空

    try {
        const res = await fetch(`${API_URL}/api/trips/${tripId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            fetchMessages(); // 傳送後立即刷新一次
        }
    } catch (e) { alert("傳送失敗"); }
}

function scrollToBottom() {
    const windowEl = document.getElementById('chat-window');
    windowEl.scrollTop = windowEl.scrollHeight;
}
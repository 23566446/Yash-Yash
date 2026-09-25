const API_URL = window.YashYashConfig.API_URL;
const tripId = new URLSearchParams(window.location.search).get('id');
if (!localStorage.getItem('yashyash_user') || !localStorage.getItem('yashyash_token')) { localStorage.removeItem('yashyash_user'); localStorage.removeItem('yashyash_token'); window.location.href = 'login.html'; }

let currentUser = JSON.parse(localStorage.getItem('yashyash_user'));
const messagesByKey = new Map();
let pollTimer = null;

function denyAccess() {
    stopFallbackPolling();
    alert('你沒有權限存取這個內容');
    window.location.href = 'index.html';
}

window.onload = async () => {
    currentUser = await window.YashYashSession.ready;
    if (!tripId || !currentUser) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('back-to-details').onclick = () => {
        window.location.href = `trip-details.html?id=${encodeURIComponent(tripId)}`;
    };

    if (!await fetchTripInfo()) return;
    await fetchMessages();
    initializeRealtime();
};

async function fetchTripInfo() {
    const res = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}`);
    if (res.status === 403) { denyAccess(); return false; }
    if (!res.ok) { alert('載入行程失敗'); return false; }
    const trip = await res.json();
    document.getElementById('chat-trip-title').textContent = trip.title;
    return true;
}

async function fetchMessages() {
    try {
        const res = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}/chat`);
        if (res.status === 403) return denyAccess();
        if (!res.ok) throw new Error('訊息讀取失敗');
        const messages = await res.json();
        mergeMessages(Array.isArray(messages) ? messages : []);
    } catch (error) {
        console.error('訊息獲取失敗');
    }
}

function mergeMessages(messages) {
    let changed = false;
    messages.forEach(message => {
        const key = window.YashYashChatUtils.messageKey(message);
        if (!messagesByKey.has(key)) {
            messagesByKey.set(key, message);
            changed = true;
        }
    });
    if (changed) {
        const orderedMessages = window.YashYashChatUtils.sortMessages(messagesByKey.values());
        renderMessages(orderedMessages);
        scrollToBottom();
    }
}

function renderMessages(messages) {
    const windowEl = document.getElementById('chat-window');
    windowEl.replaceChildren();
    if (messages.length === 0) {
        const empty = document.createElement('p'); empty.className = 'empty-text'; empty.textContent = '這裡還沒有訊息，開始聊天吧！'; windowEl.appendChild(empty);
        return;
    }
    messages.forEach(message => {
        const isMine = message.senderAccount ? message.senderAccount === currentUser.account : message.sender === currentUser.nickname;
        const row = document.createElement('div'); row.className = `msg ${isMine ? 'me' : 'others'}`;
        const img = document.createElement('img'); img.className = 'msg-avatar'; img.src = window.safeImageSource ? safeImageSource(message.avatar) : 'img/default-avatar.svg'; img.onerror = () => { img.src = 'img/default-avatar.svg'; };
        const body = document.createElement('div');
        const sender = document.createElement('div'); sender.style.cssText = 'font-size:0.7rem;color:#888;margin-bottom:2px;'; sender.textContent = message.sender || '';
        const text = document.createElement('div'); text.className = 'msg-content'; text.textContent = message.text || '';
        const time = document.createElement('div'); time.className = 'msg-info'; time.textContent = new Date(message.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        body.append(sender, text, time); row.append(img, body); windowEl.appendChild(row);
    });
}

async function handleSend(event) {
    event.preventDefault();
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    try {
        const res = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error('傳送失敗');
        mergeMessages([await res.json()]);
    } catch (error) {
        input.value = text;
        window.showToast?.('傳送失敗，請再試一次', 'error');
    }
}

function startFallbackPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(fetchMessages, 15000);
}

function stopFallbackPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
}

function joinTripRoom(socket) {
    socket.emit('trip:join', tripId, result => {
        if (!result?.ok) startFallbackPolling();
    });
}

async function initializeRealtime() {
    const realtime = window.YashYashRealtime;
    if (!realtime) return startFallbackPolling();

    realtime.on('trip:message', handleRealtimeMessage);
    realtime.on('connect', handleRealtimeConnect);
    realtime.on('disconnect', startFallbackPolling);
    realtime.on('connect_error', startFallbackPolling);
    try {
        const socket = await realtime.connect();
        if (!socket) return startFallbackPolling();
        if (socket.connected) handleRealtimeConnect();
    } catch (error) {
        startFallbackPolling();
    }
}

function handleRealtimeMessage(message) {
    mergeMessages([message]);
}

function handleRealtimeConnect() {
    stopFallbackPolling();
    const socket = window.YashYashRealtime.getSocket();
    if (socket) joinTripRoom(socket);
    fetchMessages();
}

function cleanupRealtime() {
    stopFallbackPolling();
    const realtime = window.YashYashRealtime;
    if (!realtime) return;
    realtime.off('trip:message', handleRealtimeMessage);
    realtime.off('connect', handleRealtimeConnect);
    realtime.off('disconnect', startFallbackPolling);
    realtime.off('connect_error', startFallbackPolling);
    realtime.disconnect();
}

window.addEventListener('pagehide', cleanupRealtime);
window.addEventListener('beforeunload', cleanupRealtime);

function scrollToBottom() {
    const windowEl = document.getElementById('chat-window');
    windowEl.scrollTop = windowEl.scrollHeight;
}

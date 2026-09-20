const API_URL = window.YashYashConfig.API_URL;
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
if (!localStorage.getItem('yashyash_user') || !localStorage.getItem('yashyash_token')) { localStorage.removeItem('yashyash_user'); localStorage.removeItem('yashyash_token'); window.location.href = 'login.html'; }

const userData = localStorage.getItem('yashyash_user');
const currentUser = JSON.parse(userData);

let lastMessageCount = 0;
let pollTimer = null;
function denyAccess() { if (pollTimer) clearInterval(pollTimer); alert('你沒有權限存取這個內容'); window.location.href = 'index.html'; }

window.onload = async () => {
    if (!tripId || !currentUser) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('back-to-details').onclick = () => {
        window.location.href = `trip-details.html?id=${tripId}`;
    };

    if (!await fetchTripInfo()) return;
    fetchMessages();
    pollTimer = setInterval(fetchMessages, 3000);
};

async function fetchTripInfo() {
    const res = await apiFetch(`${API_URL}/api/trips/${tripId}`);
    if (res.status === 403) { denyAccess(); return false; }
    if (!res.ok) { alert('載入行程失敗'); return false; }
    const trip = await res.json();
    document.getElementById('chat-trip-title').innerText = trip.title;
    return true;
}

async function fetchMessages() {
    try {
        const res = await apiFetch(`${API_URL}/api/trips/${tripId}/chat`);
        if (res.status === 403) return denyAccess();
        if (!res.ok) throw new Error('訊息讀取失敗');
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
    windowEl.replaceChildren();
    if (messages.length === 0) {
        const empty = document.createElement('p'); empty.className = 'empty-text'; empty.textContent = '這裡還沒有訊息，開始聊天吧！'; windowEl.appendChild(empty);
        return;
    }
    messages.forEach(m => { const row=document.createElement('div'); row.className=`msg ${m.sender===currentUser.nickname?'me':'others'}`; const img=document.createElement('img'); img.className='msg-avatar'; img.src=/^data:image\/(jpeg|png|webp|gif|heic|heif|avif);base64,/i.test(m.avatar||'')?m.avatar:'img/default-avatar.svg'; img.onerror=()=>{img.src='img/default-avatar.svg';}; const body=document.createElement('div'); const sender=document.createElement('div'); sender.style.cssText='font-size:0.7rem;color:#888;margin-bottom:2px;'; sender.textContent=m.sender||''; const text=document.createElement('div'); text.className='msg-content'; text.textContent=m.text||''; const time=document.createElement('div'); time.className='msg-info'; time.textContent=new Date(m.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); body.append(sender,text,time); row.append(img,body); windowEl.appendChild(row); });
}

async function handleSend(e) {
    e.preventDefault();
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
        const res = await apiFetch(`${API_URL}/api/trips/${tripId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            fetchMessages(); // 傳送後立即刷新一次
        } else {
            input.value = text;
            alert("傳送失敗，請再試一次");
        }
    } catch (e) {
        input.value = text;
        alert("傳送失敗，請再試一次");
    }
}

function scrollToBottom() {
    const windowEl = document.getElementById('chat-window');
    windowEl.scrollTop = windowEl.scrollHeight;
}


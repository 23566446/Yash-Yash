const API_URL = window.YashYashConfig.API_URL;
const tripId = new URLSearchParams(window.location.search).get('id');
if (!localStorage.getItem('yashyash_user') || !localStorage.getItem('yashyash_token')) { localStorage.removeItem('yashyash_user'); localStorage.removeItem('yashyash_token'); window.location.href = 'login.html'; }

const quickQuestions = [
    '幫我整理今天的行程',
    '明天行程會不會排太滿？',
    '幫我整理目前旅費狀況',
    '根據目前行程給我注意事項'
];

window.addEventListener('load', initializeAIPage);

async function initializeAIPage() {
    if (!tripId) return window.location.href = 'index.html';
    document.getElementById('back-to-details').addEventListener('click', () => {
        window.location.href = `trip-details.html?id=${encodeURIComponent(tripId)}`;
    });
    document.getElementById('ai-form').addEventListener('submit', submitQuestion);
    const actions = document.getElementById('ai-quick-actions');
    quickQuestions.forEach(question => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-small';
        button.textContent = question;
        button.addEventListener('click', () => {
            document.getElementById('ai-question').value = question;
            document.getElementById('ai-question').focus();
        });
        actions.appendChild(button);
    });

    try {
        const response = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}`);
        if (response.status === 403) return denyAccess();
        if (!response.ok) throw new Error('載入行程失敗');
        const trip = await response.json();
        document.getElementById('ai-trip-title').textContent = `${trip.title} AI 助手`;
    } catch (error) {
        showAIMessage('無法載入行程資料', 'error');
    }
}

function denyAccess() {
    window.showToast?.('你沒有權限存取這個內容', 'error');
    window.location.href = 'index.html';
}

function showAIMessage(text, type) {
    const message = document.createElement('div');
    message.className = `ai-message ${type}`;
    message.textContent = text;
    document.getElementById('ai-conversation').appendChild(message);
}

async function submitQuestion(event) {
    event.preventDefault();
    const input = document.getElementById('ai-question');
    const button = document.getElementById('ai-submit');
    const question = input.value;
    if (!question.trim()) return;

    showAIMessage(question, 'user');
    input.value = '';
    button.disabled = true;
    button.textContent = '思考中…';
    try {
        const response = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || 'AI 助手暫時無法回應');
        showAIMessage(result.answer, 'assistant');
    } catch (error) {
        showAIMessage(error.message || 'AI 助手暫時無法回應', 'error');
    } finally {
        button.disabled = false;
        button.textContent = '詢問 AI';
    }
}

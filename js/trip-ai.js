const API_URL = window.YashYashConfig.API_URL;
const tripId = new URLSearchParams(window.location.search).get('id');

const quickQuestions = [
    '幫我整理今天的行程',
    '明天行程會不會排太滿？',
    '幫我整理目前旅費狀況',
    '根據目前行程給我注意事項'
];

window.addEventListener('load', initializeAIPage);

async function initializeAIPage() {
    await window.YashYashSession.ready;
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

function showAIStatus(text, category) {
    const status = document.createElement('div');
    status.className = `ai-status-card ${category || 'AI_PROVIDER_FAILURE'}`;
    const heading = document.createElement('strong');
    heading.textContent = category === 'AI_BILLING_ERROR' ? 'AI 額度狀態' : ['AI_NOT_CONFIGURED', 'AI_AUTH_ERROR', 'AI_MODEL_ERROR'].includes(category) ? 'AI 設定狀態' : '連線狀態';
    const message = document.createElement('p');
    message.textContent = text;
    status.append(heading, message);
    document.getElementById('ai-conversation').appendChild(status);
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
    const thinking = document.createElement('div');
    thinking.className = 'ai-thinking';
    thinking.textContent = 'YashYash AI 正在整理旅程建議…';
    document.getElementById('ai-conversation').appendChild(thinking);
    try {
        const response = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAIStatus(result.message || 'AI 助手暫時無法回應', result.category);
            return;
        }
        showAIMessage(result.answer, 'assistant');
    } catch (error) {
        showAIStatus(error.message || 'AI 助手暫時無法回應', 'AI_PROVIDER_FAILURE');
    } finally {
        thinking.remove();
        button.disabled = false;
        button.textContent = '詢問 AI';
    }
}

function validateQuestion(question, maxLength = 1000) {
    if (typeof question !== 'string' || !question.trim() || question.length > maxLength) return { ok: false };
    return { ok: true, value: question };
}

function createRateWindow({ limit = 6, windowMs = 5 * 60 * 1000, now = Date.now } = {}) {
    const requests = new Map();
    return {
        allow(account) {
            const cutoff = now() - windowMs;
            const recent = (requests.get(account) || []).filter(timestamp => timestamp > cutoff);
            if (recent.length >= limit) {
                requests.set(account, recent);
                return false;
            }
            recent.push(now());
            requests.set(account, recent);
            return true;
        }
    };
}

module.exports = { validateQuestion, createRateWindow };

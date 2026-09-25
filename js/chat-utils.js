(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.YashYashChatUtils = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    function messageKey(message) {
        if (message?.messageId) return `id:${message.messageId}`;
        return `legacy:${JSON.stringify([
            message?.time || '',
            message?.senderAccount || '',
            message?.sender || '',
            message?.text || ''
        ])}`;
    }

    function compareMessages(a, b) {
        const aTime = Date.parse(a?.time);
        const bTime = Date.parse(b?.time);
        const safeATime = Number.isFinite(aTime) ? aTime : Number.POSITIVE_INFINITY;
        const safeBTime = Number.isFinite(bTime) ? bTime : Number.POSITIVE_INFINITY;
        if (safeATime !== safeBTime) return safeATime - safeBTime;
        const aKey = messageKey(a);
        const bKey = messageKey(b);
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    }

    function sortMessages(messages) {
        return [...messages].sort(compareMessages);
    }

    return { messageKey, compareMessages, sortMessages };
}));

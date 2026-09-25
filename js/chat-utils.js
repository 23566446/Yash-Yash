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

    return { messageKey };
}));

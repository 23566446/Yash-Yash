(function () {
    const tripId = new URLSearchParams(window.location.search).get('id');
    if (!tripId) return;
    const pages = [['trip-details.html', '行程', '⌖'], ['trip-chat.html', '聊天', '◌'], ['trip-ledger.html', '記帳', '＄'], ['trip-album.html', '相簿', '▧'], ['trip-ai.html', 'AI', '✦']];
    const current = location.pathname.split('/').pop();
    const nav = document.createElement('nav');
    nav.className = 'trip-workspace-nav';
    nav.setAttribute('aria-label', '行程工作區');
    pages.forEach(([page, label, icon]) => {
        const link = document.createElement('a'); link.href = `${page}?id=${encodeURIComponent(tripId)}`; link.title = label; link.setAttribute('aria-label', label);
        const glyph = document.createElement('span'); glyph.className = 'workspace-icon'; glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = icon;
        const text = document.createElement('span'); text.className = 'workspace-label'; text.textContent = label;
        link.append(glyph, text);
        if (page === current) link.className = 'active';
        nav.appendChild(link);
    });
    const header = document.querySelector('.app-header');
    if (header && header.parentNode) {
        header.parentNode.insertBefore(nav, header.nextSibling);
        return;
    }

    const target = document.querySelector('main') || document.body;
    target.parentNode.insertBefore(nav, target);
})();

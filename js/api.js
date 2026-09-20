(function () {
    function isAuthenticationPage() {
        return /(?:login|register)\.html$/i.test(window.location.pathname);
    }

    async function apiFetch(resource, options = {}) {
        const token = localStorage.getItem('yashyash_token');
        const headers = new Headers(options.headers || {});
        if (token) headers.set('Authorization', `Bearer ${token}`);

        const response = await fetch(resource, { ...options, headers });
        if (response.status === 401 && !isAuthenticationPage()) {
            localStorage.removeItem('yashyash_token');
            localStorage.removeItem('yashyash_user');
            window.location.href = 'login.html';
        }
        return response;
    }

    window.apiFetch = apiFetch;
}());

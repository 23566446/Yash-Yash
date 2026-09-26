(function () {
    const API_URL = window.YashYashConfig?.API_URL;
    const listeners = new Map();
    let clientPromise = null;
    let socket = null;

    function loadClient() {
        if (window.io) return Promise.resolve();
        if (clientPromise) return clientPromise;

        clientPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${API_URL.replace(/\/$/, '')}/socket.io/socket.io.js`;
            script.async = true;
            script.onload = () => window.io ? resolve() : reject(new Error('Socket.IO client unavailable'));
            script.onerror = () => reject(new Error('Socket.IO client failed to load'));
            document.head.appendChild(script);
        }).catch(error => {
            clientPromise = null;
            throw error;
        });

        return clientPromise;
    }

    async function connect() {
        if (socket) return socket;
        const token = localStorage.getItem('yashyash_token');
        if (!token || !API_URL) return null;

        await loadClient();
        socket = window.io(API_URL, { auth: { token } });
        socket.on('session:revoked', () => {
            localStorage.removeItem('yashyash_token');
            localStorage.removeItem('yashyash_user');
            window.location.replace('login.html');
        });
        listeners.forEach((handlers, event) => handlers.forEach(handler => socket.on(event, handler)));
        return socket;
    }

    function on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        if (socket) socket.on(event, handler);
    }

    function off(event, handler) {
        listeners.get(event)?.delete(handler);
        if (socket) socket.off(event, handler);
    }

    function disconnect() {
        socket?.disconnect();
        socket = null;
    }

    window.YashYashRealtime = { connect, getSocket: () => socket, on, off, disconnect };
}());

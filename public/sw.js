self.addEventListener('push', function(event) {
    let title = "PERINGATAN GEMPA LOKAL";
    let body = "Ada pembaruan data aktivitas seismik di area Jateng-DIY. Silakan cek radar.";

    if (event.data) {
        try {
            // Mencoba membaca kiriman sebagai JSON terstruktur
            const data = event.data.json();
            title = data.title || title;
            body = data.body || body;
        } catch (e) {
            // Jika kiriman berupa teks biasa/gagal di-parse, gunakan teks mentah tersebut
            if (event.data.text()) {
                body = event.data.text();
            }
        }
    }

    const options = {
        body: body,
        icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
        vibrate: [300, 100, 300, 100, 400],
        data: { dateOfArrival: Date.now() },
        actions: [
            { action: 'buka', title: 'BUKA RADAR ALARM' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if ('focus' in client && typeof client.focus === 'function') {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

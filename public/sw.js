// public/sw.js
self.addEventListener('push', function(event) {
    if (event.data) {
        try {
            const data = event.data.json();
            
            const options = {
                body: data.body,
                icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                badge: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                vibrate: [300, 100, 300, 100, 300], // Pola getar intermiten saat layar dikunci
                data: { url: self.location.origin },
                tag: 'gempa-alert',
                renotify: true
            };

            event.waitUntil(
                self.registration.showNotification(data.title, options)
            );
        } catch (e) {
            console.error("Gagal mengurai payload data push:", e);
        }
    }
});

// Jika notifikasi di HP diklik, otomatis membuka web Anda kembali
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
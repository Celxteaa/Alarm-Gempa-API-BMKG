// Mendengarkan event sinyal push masuk dari backend Vercel
self.addEventListener('push', function(event) {
    if (event.data) {
        try {
            const data = event.data.json();
            
            const options = {
                body: data.body,
                // Menggunakan aset gambar lonceng darurat (Sesuai dengan fungsi kirimPushNotification di index.html)
                icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                badge: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                vibrate: [300, 100, 300, 100, 400],
                data: {
                    dateOfArrival: Date.now()
                },
                actions: [
                    { action: 'buka', title: 'BUKA RADAR ALARM' }
                ]
            };

            event.waitUntil(
                self.registration.showNotification(data.title, options)
            );
        } catch (e) {
            // Penanganan cadangan jika payload yang dikirim dari backend berupa teks biasa, bukan objek JSON
            const options = {
                body: event.data.text(),
                icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                vibrate: [200, 100, 200]
            };
            event.waitUntil(
                self.registration.showNotification("PERINGATAN DINI GEMPA!", options)
            );
        }
    }
});

// Aksi ketika spanduk notifikasi di HP/Laptop di-klik oleh pengguna
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Tutup jendela notifikasi terlebih dahulu
    
    // Otomatis membuka tab aplikasi alarm gempa atau memfokuskan jika tabnya sudah terbuka
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if ('focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
import 'dotenv/config'; // <-- Membaca file .env di local
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Mengonfigurasi kunci enkripsi VAPID untuk pengiriman push notification
webpush.setVapidDetails(
  'mailto:your-email@domain.com', // Ubah dengan email Anda bebas
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Koordinat lingkaran hijau radar Anda (Jateng-DIY)
const CENTROID_LAT = -7.3500; 
const CENTROID_LON = 110.2000; 
const RADIUS_MAX_KM = 300.0;

function hitungHaversineBackend(gempaLat, gempaLon) {
    const R = 6371.0;
    const dLat = (gempaLat - CENTROID_LAT) * Math.PI / 180.0;
    const dLon = (gempaLon - CENTROID_LON) * Math.PI / 180.0;
    const lat1 = CENTROID_LAT * Math.PI / 180.0;
    const lat2 = gempaLat * Math.PI / 180.0;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export default async function handler(req, res) {
    try {
        // Ambil data gempa terbaru langsung dari server BMKG
        const response = await fetch("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json?t=" + Date.now());
        const data = await response.json();
        const gempa = data.Infogempa.gempa;
        
        const idGempaSekarang = gempa.Tanggal + "_" + gempa.Jam;

        // Cek cache data gempa sebelumnya di database agar tidak terjadi spam alarm
        const { data: cache } = await supabase.from('subscriptions').select('auth').eq('endpoint', 'LAST_ID_CACHE').single();
        
        if (cache && cache.auth === idGempaSekarang) {
            return res.status(200).json({ message: "Standby. Tidak ada gempa baru." });
        }

        // Ambil koordinat titik episentrum gempa
        const koordinatRaw = gempa.Coordinates;
        const posisiKoma = koordinatRaw.indexOf(',');
        const gempaLat = parseFloat(koordinatRaw.substring(0, posisiKoma));
        const gempaLon = parseFloat(koordinatRaw.substring(posisiKoma + 1));
        const magnitudo = parseFloat(gempa.Magnitude);
        const wilayah = gempa.Wilayah;

        const jarak = hitungHaversineBackend(gempaLat, gempaLon);
        const wilayahLower = wilayah.toLowerCase();
        
        // Pendeteksi teks wilayah darurat lokal Anda
        const sebutWilayahKita = wilayahLower.includes("diy") || wilayahLower.includes("yogyakarta") || 
                                 wilayahLower.includes("jawa tengah") || wilayahLower.includes("jateng") ||
                                 wilayahLower.includes("bantul") || wilayahLower.includes("sleman");

        // Validasi geolock: Jika berada di dalam radius 300 KM radar hijau
        if (jarak <= RADIUS_MAX_KM || sebutWilayahKita) {
            
            // Ambil seluruh token browser HP target dari database
            const { data: users } = await supabase.from('subscriptions').select('*').not('endpoint', 'eq', 'LAST_ID_CACHE');
            
            const payload = JSON.stringify({
                title: "🚨 PERINGATAN DINI GEMPA!",
                body: `M: ${magnitudo} SR | Jarak: ${Math.round(jarak)} KM. Pusat: ${wilayah.toUpperCase()}`
            });

            // Tembak push notification ke semua perangkat terdaftar secara paralel
            const pushPromises = users.map(user => {
                const pushSubscription = {
                    endpoint: user.endpoint,
                    keys: { p256dh: user.p256dh, auth: user.auth }
                };
                return webpush.sendNotification(pushSubscription, payload).catch((err) => {
                    // Jika token browser sudah expired, hapus otomatis dari database
                    return supabase.from('subscriptions').delete().eq('id', user.id);
                });
            });

            await Promise.all(pushPromises);
        }

        // Perbarui log cache gempa saat ini ke Supabase agar menit depan disaring kembali
        await supabase.from('subscriptions').upsert({ endpoint: 'LAST_ID_CACHE', p256dh: 'CACHE', auth: idGempaSekarang }, { onConflict: 'endpoint' });

        return res.status(200).json({ message: "Pemeriksaan selesai, log berhasil diperbarui." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
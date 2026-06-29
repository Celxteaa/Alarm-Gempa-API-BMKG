import 'dotenv/config'; 
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Konfigurasi Kunci VAPID (Sesuai dengan Public Key di index.html)
webpush.setVapidDetails(
  'mailto:celxtea@proton.me', 
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// KONSISTENSI GEOLOCK: Sama persis dengan variabel di dalam index.html
const CENTROID_LAT = -7.3500; 
const CENTROID_LON = 110.2000; 
const RADIUS_MAX_KM = 300.0;

// FORMULA HAVERSINE BACKEND: Sama persis dengan fungsi hitungJarakKeWilayah() di index.html
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
        // 1. Ambil data gempa terbaru langsung dari server BMKG
        const response = await fetch("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json?t=" + Date.now());
        const data = await response.json();
        const gempa = data.Infogempa.gempa;
        
        // Buat ID unik gabungan Tanggal dan Jam Gempa untuk pengecekan duplikasi
        const idGempaSekarang = gempa.Tanggal + "_" + gempa.Jam;

        // 2. SOLUSI AMAN ERROR 500: Menggunakan .limit(1) agar tidak crash saat database pertama kali kosong
        const { data: cacheData } = await supabase
            .from('subscriptions')
            .select('auth')
            .eq('endpoint', 'LAST_ID_CACHE')
            .limit(1);
        
        const cache = cacheData && cacheData.length > 0 ? cacheData[0] : null;
        
        // Jika gempa yang dibaca sama dengan cache di database, hentikan sistem (Standby)
        if (cache && cache.auth === idGempaSekarang) {
            return res.status(200).json({ message: "Standby. Tidak ada peristiwa gempa baru." });
        }

        // 3. Ekstrak parameter koordinat dan wilayah dari BMKG
        const koordinatRaw = gempa.Coordinates;
        const posisiKoma = koordinatRaw.indexOf(',');
        const gempaLat = parseFloat(koordinatRaw.substring(0, posisiKoma));
        const gempaLon = parseFloat(koordinatRaw.substring(posisiKoma + 1));
        const magnitudo = parseFloat(gempa.Magnitude);
        const wilayah = gempa.Wilayah;

        // Pembersihan string nama lokasi (Sesuai algoritma UI index.html Anda)
        let wilayahSpesifik = wilayah;
        const indeksKeyword = wilayahSpesifik.indexOf("km ");
        if (indeksKeyword !== -1) {
            wilayahSpesifik = wilayahSpesifik.substring(indeksKeyword + 3);
        }
        if (wilayahSpesifik.length > 25) {
            wilayahSpesifik = wilayahSpesifik.substring(0, 23) + "..";
        }

        const jarak = hitungHaversineBackend(gempaLat, gempaLon);
        const wilayahLower = wilayah.toLowerCase();
        
        // KONSISTENSI KATA KUNCI: Sama persis dengan deteksi teks wilayah di index.html
        const sebutWilayahKita =    wilayahLower.includes("diy") || 
                                    wilayahLower.includes("yogyakarta") || 
                                    wilayahLower.includes("jawa tengah") ||
                                    wilayahLower.includes("jateng") ||
                                    wilayahLower.includes("bantul") ||
                                    wilayahLower.includes("gunungkidul") ||
                                    wilayahLower.includes("kulonprogo") ||
                                    wilayahLower.includes("sleman");

        // 4. Jika gempa masuk radius 300KM atau menyebut wilayah Jateng-DIY, sebarkan alarm push
        if (jarak <= RADIUS_MAX_KM || sebutWilayahKita) {
            
            // Ambil semua token browser user terdaftar (abaikan baris log cache)
            const { data: users } = await supabase.from('subscriptions').select('*').not('endpoint', 'eq', 'LAST_ID_CACHE');
            
            if (users && users.length > 0) {
                // PAYLOAD FORMAT: Sesuai struktur data notifikasi yang ditangkap oleh frontend/sw.js
                const payload = JSON.stringify({
                    title: "PERINGATAN DINI GEMPA!",
                    body: `M: ${magnitudo} SR | Jarak: ${Math.round(jarak)} KM. Pusat: ${wilayahSpesifik.toUpperCase()}`
                });

                // Kirim notifikasi secara bersamaan ke seluruh HP/Laptop aktif yang terdaftar
                const pushPromises = users.map(user => {
                    const pushSubscription = {
                        endpoint: user.endpoint,
                        keys: { p256dh: user.p256dh, auth: user.auth }
                    };
                    return webpush.sendNotification(pushSubscription, payload).catch((err) => {
                        // Otomatis hapus token dari Supabase jika izin push di HP pengguna sudah kedaluwarsa/uninstalled
                        return supabase.from('subscriptions').delete().eq('endpoint', user.endpoint);
                    });
                });

                await Promise.all(pushPromises);
            }
        }

        // 5. Perbarui baris log cache agar cron job menit berikutnya tidak mengirimkan notifikasi berulang
        await supabase.from('subscriptions').upsert(
            { endpoint: 'LAST_ID_CACHE', p256dh: 'CACHE', auth: idGempaSekarang }, 
            { onConflict: 'endpoint' }
        );

        return res.status(200).json({ message: "Pemeriksaan sukses. Log cache gempa berhasil diperbarui." });
    } catch (err) {
        console.error("Crash logs:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
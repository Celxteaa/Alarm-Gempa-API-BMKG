import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Inisialisasi Supabase menggunakan variabel lingkungan dari Vercel
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
    // Hanya izinkan metode POST sesuai kiriman dari index.html
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const subscription = req.body;

        // Validasi struktur data push subscription dari browser pengguna
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ error: 'Struktur data subscription push tidak valid.' });
        }

        // Simpan atau update token perangkat ke dalam tabel 'subscriptions' di Supabase
        const { error } = await supabase.from('subscriptions').upsert({
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth
        }, { onConflict: 'endpoint' });

        if (error) throw error;

        return res.status(200).json({ message: 'Token browser berhasil didaftarkan ke Supabase!' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
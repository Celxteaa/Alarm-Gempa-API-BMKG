import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

webpush.setVapidDetails(
    'mailto:celxtea@proton.me',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan' });

    try {
        const subscription = req.body;
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ error: 'Struktur token tidak valid' });
        }

        // 1. Simpan ke database Supabase
        const { error: dbError } = await supabase.from('subscriptions').upsert({
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth
        }, { onConflict: 'endpoint' });

        if (dbError) throw new Error(`Supabase Error: ${dbError.message}`);

        // 2. Kirim payload JSON terstruktur
        const payload = JSON.stringify({
            title: "BACKEND TERHUBUNG",
            body: "Sistem sukses memverifikasi token Anda. Siap menerima alarm gempa Jateng-DIY!"
        });

        await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { 
                p256dh: subscription.keys.p256dh, 
                auth: subscription.keys.auth 
            }
        }, payload);

        return res.status(200).json({ message: 'Token disimpan & notifikasi uji coba dikirim!' });
    } catch (err) {
        console.error("Detail Error di Server Vercel:", err.message);
        return res.status(500).json({ error: err.message });
    }
}

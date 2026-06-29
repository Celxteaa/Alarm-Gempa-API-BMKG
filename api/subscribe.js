import 'dotenv/config'; // <-- Membaca file .env di local
import { createClient } from '@supabase/supabase-js';

// Mengambil variabel secara aman dari environment
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const subscription = req.body;
    
    try {
        // Menyimpan atau memperbarui token HP ke Supabase
        const { error } = await supabase.from('subscriptions').upsert({
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth
        }, { onConflict: 'endpoint' });

        if (error) throw error;
        return res.status(200).json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
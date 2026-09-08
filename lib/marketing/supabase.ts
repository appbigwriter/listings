import { createClient } from '@supabase/supabase-js';
export function getSupabase() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) return null; return createClient(url, key); }
export function missingSupabase() { return { error: 'Supabase não configurado.', status: 503 }; }

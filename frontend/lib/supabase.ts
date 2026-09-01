import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const missing =
  !url ||
  !anonKey ||
  anonKey === 'your-anon-key' ||
  url.includes('your-project');

if (missing) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Copy frontend/.env.example to frontend/.env.local.'
  );
}

export const supabase = createClient(url, anonKey);

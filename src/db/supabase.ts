import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

// Service-role client — bypasses RLS. Server-side only; never expose this key.
export const supabase: SupabaseClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Throws on Postgrest error; returns data. Use after every supabase query.
// Preserves the underlying cause so "fetch failed" errors surface real reasons
// (DNS, TLS, network) instead of a generic message.
export function unwrap<T>(res: { data: T; error: (Error & { cause?: unknown }) | { message: string } | null }): T {
  if (res.error) {
    const cause = (res.error as { cause?: unknown }).cause;
    if (cause instanceof Error) throw new Error(`${res.error.message}: ${cause.message}`, { cause });
    throw new Error(res.error.message, { cause: res.error });
  }
  return res.data;
}

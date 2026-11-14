import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client. It uses the service-role key, which bypasses row-level security, so it
 * must never leave the server (this file is `server-only`). The tables have RLS on and no anon policies.
 */
export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const g = globalThis as unknown as { __baaziSupabase?: SupabaseClient };

export function supabaseAdmin(): SupabaseClient {
  if (g.__baaziSupabase) return g.__baaziSupabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase isn't configured");
  g.__baaziSupabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return g.__baaziSupabase;
}

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabase = url && key ? createClient(url, key) : null;

export function isSupabaseConfigured() {
  return !!supabase;
}

export async function getSupabaseOrNull() {
  if (!supabase) return null;
  try {
    // quick health check
    const { error } = await supabase.from("assets").select("id").limit(1);
    if (error && error.code === "42P01") return null; // table not exist
    return supabase;
  } catch {
    return null;
  }
}

// NEXT_PUBLIC_* vars are inlined at build time, so they must be referenced literally.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseEnv() {
  if (!url || !key) {
    throw new Error(
      "Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local (lokal) atau di " +
        "Environment Variables Vercel.",
    );
  }
  return { url, key };
}

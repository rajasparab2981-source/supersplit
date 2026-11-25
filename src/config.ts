// Which Supabase project the app talks to.
//
// Set per environment with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// (.env.development for local dev, netlify.toml contexts for deploys).
// The fallback is STAGING, never production, so a misconfigured build can
// never write to live data. Keys here are publishable (public by design);
// Row Level Security decides what each signed-in user can do.

const STAGING_URL = 'https://zsvahcukfzilsvxdsilv.supabase.co';
const STAGING_KEY = 'sb_publishable_pc3aA6mjXwZDucQzYyaZ9g_CV3Xs1E4';

export const builtinConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? STAGING_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? STAGING_KEY,
};

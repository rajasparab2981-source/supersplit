// Supabase project the deployed app connects to by default.
//
// The anon key is designed to be public: on its own it can read nothing,
// because Row Level Security requires the group passcode (Phase 0) and,
// from Phase 3, a signed-in user. Override per environment with
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (e.g. a staging project).

export const builtinConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? 'https://uardivkwulfjwgmwmsqn.supabase.co',
  supabaseKey:
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhcmRpdmt3dWxmandnbXdtc3FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MTY4MjksImV4cCI6MjA5NDQ5MjgyOX0.VY6nVS0WcuTCem2HWQknBwQ1KQ6JvgN6q0KlODq8egE',
};

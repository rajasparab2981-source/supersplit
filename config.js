/* ============================================================
   SplitPro — Built-in cloud config

   Paste your Supabase Project URL + anon public key below.
   When this file is deployed alongside index.html, friends who
   open the URL get auto-connected to your shared database on
   first paint — no setup required on their end.

   Get these from supabase.com → your project:
     - URL:  Project Settings → Data API   (or Connect button)
     - key:  Project Settings → API Keys → Legacy → "anon public"

   Notes on safety:
     - The anon key is intentionally public when RLS is disabled.
     - Anyone with the URL of your deployed site can read/write.
     - That's the original "trusted friend group" model from the
       handoff doc — fine for a private deploy you only share
       with people you trust.
   ============================================================ */

window.SplitProConfig = {
  supabaseUrl: 'https://uardivkwulfjwgmwmsqn.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhcmRpdmt3dWxmandnbXdtc3FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MTY4MjksImV4cCI6MjA5NDQ5MjgyOX0.VY6nVS0WcuTCem2HWQknBwQ1KQ6JvgN6q0KlODq8egE',
};

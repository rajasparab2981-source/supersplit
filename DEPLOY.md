# Deploy SplitPro to Netlify

## Before deploy — bake in your Supabase credentials (recommended)

So your friends don't have to paste anything to join. Open `config.js` and fill in the two values:

```js
window.SplitProConfig = {
  supabaseUrl: 'https://xxxxxxx.supabase.co',  // your Project URL
  supabaseKey: 'eyJhbGci...',                  // your anon public key
};
```

Save the file. When deployed, anyone opening the URL gets auto-connected to your Supabase project on first paint — no gear icon, no setup sheet, no copy-paste.

> **Note:** With Supabase's "RLS disabled / trusted friend group" model (the one from the original handoff doc), the anon key is intentionally public. Anyone with the URL of your deployed site can read/write the database — same as if you'd shared the key with them manually. Only share the deploy URL with people you'd trust with the data itself.

If `config.js` is empty (default), the app falls back to local-storage mode, and the gear icon's Supabase sync sheet is still available for per-device setup.

---

Two paths. Pick whichever you prefer.

## Option A — Drag and drop (no account setup required initially)

1. Open <https://app.netlify.com/drop> in your browser.
2. Drag the entire `SplitPro` folder onto the drop zone.
3. Netlify gives you a URL like `https://random-name-123.netlify.app/`.
4. Click **Site settings → Change site name** to rename it (e.g. `splitpro-mustafa`).

You're live. Share `https://splitpro-mustafa.netlify.app/` with your group.

## Option B — Netlify CLI (recommended for re-deploys)

One-time setup:

```bash
npm install -g netlify-cli
netlify login          # opens browser, sign in / sign up
```

From the SplitPro folder:

```bash
netlify deploy --prod  # first time: pick "Create & configure a new site"
```

After the first deploy, future deploys are just `netlify deploy --prod` from the same folder.

## After deploy

1. Open your URL on phone + desktop to confirm it loads.
2. If you baked credentials into `config.js` (recommended), the app is already cloud-synced on first paint. Look for the green "live" dot next to the gear icon.
3. If you skipped `config.js`, each user opens the URL, taps the gear icon → **Supabase sync**, and pastes the same Project URL + anon key.

**Sharing with your group** (with `config.js` filled in): just send the Netlify URL. That's it. No keys to copy, no SQL to run, no settings to find. They open the link and they're already inside the shared group.

## Variant URLs

Once deployed, these all work:

| URL | Variant |
|-----|---------|
| `/` | Canonical (dark, Cred + Splitwise merged) |
| `/cred` | Cred-style dark |
| `/splitwise` | Splitwise-classic refined |
| `/light` | Original light teal |

The redirects are configured in `netlify.toml`.

## Updating after deploy

Edit any file locally, then drag the folder onto Netlify again (or `netlify deploy --prod`). The cache headers in `netlify.toml` make HTML revalidate on every load so users pick up changes immediately.

## Custom domain (optional)

In Netlify: **Site settings → Domain management → Add custom domain**. Point your domain's DNS to Netlify per their instructions. Free Let's Encrypt SSL is automatic.

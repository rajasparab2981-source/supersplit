# Deploying SplitPro

The Netlify site **supersplit** is linked to GitHub
(`rajasparab2981-source/supersplit`). There is nothing to upload by hand:

| You do | Netlify does |
|---|---|
| Push to a branch and open a pull request | Builds a **Deploy Preview** with its own URL, posted on the PR |
| Merge the pull request into `main` | Builds and publishes to https://supersplit.netlify.app |

Every build runs `npm ci && npm test && npm run build` (see `netlify.toml`).
If a test fails, the deploy fails and the live site stays as it was.

> Dragging files onto Netlify does **not** update this site. Its deploys come
> only from GitHub.

## Rolling back

Netlify → supersplit → **Deploys** → pick an earlier published deploy →
**Publish deploy**. That's instant. Then fix forward on a branch.

## Database changes

Run SQL in Supabase → SQL Editor. Order matters: **deploy app changes first**,
then run SQL that depends on them (the app is written to keep working until
the SQL runs). Never commit a real passcode or any secret key; only the
public anon key belongs in `src/config.ts`.

## Custom domain (later)

Netlify → **Domain management → Add custom domain**, then point your DNS to
Netlify. HTTPS is automatic. A domain is needed before the Android/iOS apps
(invite links that open the app).

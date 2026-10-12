# Deployment: Cloudflare Workers static assets (free tier)

The application is a fully static, client-side site. It is served as **static assets on a
Worker**, with no Worker script, so the following are not needed:

- R2, KV or a database;
- the Workers Paid plan.

On the free plan, requests for static assets are free and unlimited.

## Free-tier limits

| Limit | Workers free plan | This project |
|---|---|---|
| Size of a single asset | 25 MiB | Largest: about 1.5 MB (JavaScript chunk); largest GLB about 0.7 MB |
| Assets per Worker version | 20,000 | 37 |
| Static asset requests | Free, unlimited | — |
| Build minutes (Workers Builds) | 3,000 per month | About 1 minute per build |

## Option A: connect the GitHub repository in the dashboard (recommended)

1. Go to **Cloudflare dashboard → Workers & Pages → Create application → Import a
   repository**. Choose **GitHub** and authorise access to the repository.
2. Fill in the setup form:
   - **Project name:** `a380-digital-twin`. It must equal `name` in `wrangler.toml`.
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **API token:** *Create new token*. Don't reuse a token that belongs to another project.
3. Click **Deploy**. Every later push to the production branch rebuilds and redeploys the
   site.

The site is published at `https://a380-digital-twin.<your-subdomain>.workers.dev`. The
dashboard shows the exact URL on the Worker's page.

## Option B: deploy from your machine (Wrangler)

```bash
npm ci
npm run build                 # generates the GLBs and builds dist/
npx wrangler login            # opens the official Cloudflare OAuth flow in your browser
npm run deploy                # = wrangler deploy
```

## Option C: GitHub Actions

`.github/workflows/ci.yml` lints, typechecks, tests and builds every push. On `main` it also
deploys, once two repository secrets are added:

1. In the Cloudflare dashboard, open **My Profile → API Tokens → Create Token** and use the
   **Edit Cloudflare Workers** template.
2. In GitHub, open **Settings → Secrets and variables → Actions** and add
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Use either Option A or Option C, not both.

## Using Cloudflare Pages instead (`*.pages.dev`)

To publish at `a380-digital-twin.pages.dev` instead:

1. In **Workers & Pages → Create application**, choose the **Pages** option and connect the
   repository.
2. Use build command `npm run build` and build output directory `dist`.
3. Delete `wrangler.toml`, or replace it with `pages_build_output_dir = "dist"`, so that Pages
   does not read the Workers configuration.

## Verify a live deployment

```bash
BASE_URL=https://<your-live-url> npx playwright test --project=desktop
```

## Caching

`public/_headers` sets the cache rules. Workers static assets and Pages both honour this file.

- Hashed JavaScript and CSS bundles: immutable.
- Generated GLBs (whose file names are not hashed): one day with
  stale-while-revalidate.

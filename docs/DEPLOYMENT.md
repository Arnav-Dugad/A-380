# Deployment: Cloudflare Pages (free tier)

The application is a fully static, client-side site, so no Workers, R2, KV or database are
needed.

## Free-tier limits

| Limit | Cloudflare Pages free tier | This project |
|---|---|---|
| Size of a single file | 25 MiB | Largest: about 1.5 MB (JavaScript chunk); largest GLB about 0.7 MB |
| Files per deployment | 20,000 | About 35 |
| Builds per month | 500 | One build per deploy |

## Option A: deploy from your machine (Wrangler)

```bash
npm ci
npm run build                 # generates the GLBs and builds dist/
npx wrangler login            # opens the official Cloudflare OAuth flow in your browser
npx wrangler pages project create a380-digital-twin --production-branch main   # first time only
npx wrangler pages deploy dist --project-name a380-digital-twin --branch main
```

The site is published at **https://a380-digital-twin.pages.dev**. If that name is already
taken, choose another project name; Wrangler prints the actual URL.

## Option B: automatic deploys from GitHub

`.github/workflows/ci.yml` lints, typechecks, tests and builds every push. On `main` it
also deploys, once two repository secrets are added:

1. In the Cloudflare dashboard, open **My Profile → API Tokens → Create Token**. Choose
   **Edit Cloudflare Workers** (or a custom token with *Account → Cloudflare Pages → Edit*).
2. In GitHub, open **Settings → Secrets and variables → Actions** and add
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Alternatively, connect the repository in **Cloudflare → Workers & Pages → Create →
Pages → Connect to Git**, with build command `npm run build` and output directory `dist`.

## Verify a live deployment

```bash
BASE_URL=https://a380-digital-twin.pages.dev npx playwright test --project=desktop
```

## Caching

`public/_headers` sets the cache rules:

- Hashed JavaScript and CSS bundles: immutable.
- Generated GLBs (whose file names are not hashed): one day with
  stale-while-revalidate.

# Cloudflare deployment

JobSpace runs on Cloudflare Workers through OpenNext. Application data and
size-limited document bytes stay in Neon PostgreSQL through the `HYPERDRIVE`
binding. Local `next dev` uses the Neon URL from `.env.local` for the Hyperdrive
emulator; the production Worker does not use that local URL.

## Cloud resources

- Hyperdrive `jobspace-neon` is already configured for the Neon production
  branch and is attached in `wrangler.jsonc`.
- Create the Worker named `jobspace` in Cloudflare, then add `AUTH_SECRET` as a
  Worker secret before publishing the application. Use a long random value; do
  not add it to `wrangler.jsonc` or commit it to source control.
- The `002_document_blobs.sql` migration has been applied to Neon production;
  apply it to any additional branch before deploying code that stores documents.

## Validate and publish

```sh
npm run typecheck
npx opennextjs-cloudflare build
npx wrangler deploy --dry-run
npm run deploy
```

The deploy command publishes the Worker and its static assets. For Windows,
OpenNext recommends using WSL for the most reliable build environment.

## Local Worker preview

`npm run dev` initializes the OpenNext Cloudflare development adapter and reads
the local Neon URL from `.env.local`. For `npm run preview`, set
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` to the direct Neon
URL (`DATABASE_URL_UNPOOLED`) in the shell running Wrangler; keep that value
local and never commit it.

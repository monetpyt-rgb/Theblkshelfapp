# The BLK Shelf — Vercel edition

Read `START-HERE.md` first. This repository is a standalone Next.js app for your own Vercel account. It has no ChatGPT login, Sites hosting configuration, Cloudflare Worker, or D1 runtime dependency.

Base app: live version **21**, source commit `1d637bf6c1e67d4fe29f6e7b50afa9c0f4ce567c`. The Vercel edition ports that source to Next.js and Supabase reader storage; it does not change the currently hosted app.

## What is included

- Home, Discover, Library, Authors, Events, Randomizer, My Shelf and Profile.
- Every supplied website page under `public/mirror/`, including individual Book Spotlight and author pages.
- Hearts and reading statuses throughout the app, including Book Spotlight and centered Randomizer controls.
- Favorite authors and upcoming-book notices in My Shelf.
- Reader signup/login, confirmation resend, public display names, ratings and reviews.
- The 1–3-star rule requiring two punctuated review sentences, enforced both in the API and database.
- Home-screen icons, web-app manifest, automatic content refresh and app-version checks.
- Vercel configuration, SQL setup, private backup conversion tool, tests and lockfile.

## Hosting and data

| Data/service | Vercel edition |
|---|---|
| App pages and API routes | Your Vercel account |
| Reader signup/login accounts | Existing Supabase Auth project |
| Books, authors, featured authors, rankings and events | Existing website Supabase/API sources |
| Reader display names, shelves, book/author favorites, dismissals and reviews | New `blk_shelf_reader_*` tables in the same Supabase project |
| Website submission/tracking endpoints | Existing Google Apps Script URLs |

The public catalog is fetched live. Published/approved additions continue to appear without redeploying the app. Website layout/code edits in a separate GitHub repository are separate from this app's code.

The package is configured for Supabase project `njgprucvnayyiooiftaw`. Keep this project to retain reader account IDs, login credentials and the website catalog. The public/anonymous key is intentionally client-visible; row-level security protects private records. Never put a service-role/secret key into a `NEXT_PUBLIC_` variable. No service-role key is required to run the app.

The embedded website pages retain the existing Supabase URLs and public keys. If your team changes Supabase projects, they must also update those embedded pages and migrate the catalog, storage assets, authentication users and API settings. Changing only the two environment variables is not a complete project migration.

Google Apps Script source and Supabase's live catalog/storage contents are maintained in their existing services, not copied into this repository. Their existing connections are preserved.

## 1. Set up reader storage

Open the existing Supabase project's SQL Editor. Run the entire `supabase/reader-schema.sql` as the project owner. It is transactional and can be run again without clearing reader records. It creates five specifically named tables, policies and scoped functions; it does not replace your catalog views.

Each reader can access only their own private records. Public reviews use a function that exposes review IDs, ratings, review text, chosen public names and timestamps. It does not publish account IDs, emails, signup names or private shelves.

## 2. Transfer existing reader data

Use the separately delivered private reader backup. It contains:

- `reader-backup.json`: the exact source rows, all five tables, export time and provenance.
- `reader-import.sql`: ready-to-run SQL for the new Supabase tables.
- `README-PRIVATE.txt`: import instructions and snapshot counts.

Run `reader-import.sql` **after** schema setup, as the owner of the **same Supabase project**. Existing account IDs must exist in `auth.users`; the foreign keys deliberately refuse an import into an unrelated auth project.

The import is idempotent. It preserves review IDs and creation times and avoids overwriting newer reader changes with older snapshot timestamps. It does not import passwords or create new login accounts; those already remain in Supabase Auth.

To convert a future complete export in the same JSON format:

```sh
node scripts/reader-backup-to-sql.mjs /path/to/reader-backup.json /private/path/reader-import.sql
```

Do not put reader backups/import SQL in GitHub or `public/`. The dated snapshot will not contain changes saved after its export time. Obtain a final fresh export before cutover if the old app remains in use. Once sharing the new address, retire the old link so reader saves do not split between two databases.

Historical SQLite schema files under `db/schema.ts` and `drizzle/` document the previous storage format; Vercel does not run them. The current setup is `supabase/reader-schema.sql`.

## 3. Deploy to Vercel

1. Create a new GitHub repository containing this folder's files, including `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `app/`, `components/`, `lib/`, `public/`, `scripts/`, and `supabase/`. Do not upload `node_modules` or `.next`.
2. Import that repository into your own Vercel account as a new project.
3. Use framework preset **Next.js**, Node.js **24.x**, install command `npm ci`, build command `npm run build`. Leave Output Directory at the Next.js default; do not configure a static export.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.example` for Production and Preview. The existing public values are also defaults in the source.
5. Deploy. `vercel.json` supplies the framework and commands. The app includes API routes, so it must run as a Next.js project, not as a static HTML upload. Share the production address with public visitor access enabled so readers can open it without a Vercel team account.

These public variables are baked into browser code at build time. Redeploy after changing them. The app-version UUID is generated automatically for each build; do not set a fixed `NEXT_PUBLIC_APP_RELEASE` value in Vercel.

## 4. Finish authentication and domain setup

In the existing Supabase project's Authentication URL settings, add the exact production Vercel URL and final custom-domain URL to the allowed redirect list. Update Site URL to the final app URL at cutover; keep other legitimate website redirect entries. Signup confirmation and resend use the app's current origin as the redirect.

Configure SMTP/email delivery in the existing Supabase project if confirmation emails are not being delivered. This package does not change your email provider or its delivery limits.

Add your chosen domain to the Vercel project and copy the DNS records Vercel shows for it. An app subdomain such as `app.theblkshelf.com` lets the existing website stay on its current host. Confirm the new address is working before switching links.

Readers sign in again at the new origin using the same accounts. An existing home-screen shortcut still opens its original domain: remove/re-add it once using the new final app address. Later app updates load on reopening without reinstalling. The supplied home-screen logo remains in place.

## 5. Local development and verification

Use Node.js 24 and npm. Copy `.env.example` to `.env.local` if you want explicit local settings.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Ensure the SQL setup is complete before testing real reader saves. Use your legitimate development Supabase redirect settings if testing confirmation email links locally.

```sh
npm test
npm run build
node scripts/check-production.mjs
```

Or run all three with `npm run verify`. Tests execute the SQL in an isolated PostgreSQL-compatible PGlite database, verify reader isolation and review rules, exercise the API transport with mocked Supabase responses, and test the existing frontend bridges/update behavior. They do not write to live reader data.

The production checker starts a local Next.js server, checks all mirrored pages, icons, login gates, version consistency and cache headers, and shuts it down. Real Supabase login/email delivery and the final Vercel domain must still be checked in your accounts after deployment.

Before sharing the new link, log in with a real account, confirm restored books/display name, test favorites and reading statuses, favorite an author, write a valid low-star review, and reopen the installed web app after a later update.

## Official references

- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase authentication redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

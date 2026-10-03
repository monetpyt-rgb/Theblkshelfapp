# Export verification — October 3, 2026

Base: The BLK Shelf live version 21, commit `1d637bf6c1e67d4fe29f6e7b50afa9c0f4ce567c`.

Completed locally on Node.js 24.19.0 using Next.js 16.2.6:

- Next.js production build and TypeScript checks passed.
- 14 tests passed, covering Supabase transport, PostgreSQL privacy policies, reader isolation, shelf updates, author releases, review rules, confirmation resend, Book Spotlight and Randomizer actions, and reopening/update behavior.
- Production HTTP checks passed for all 21 mirrored HTML pages, home-screen icons, reader authentication gates, cache headers, and matching client/server app-version values.
- The real private reader backup imported into an isolated PostgreSQL-compatible database: all 10 exported records were preserved.
- Original public pages and assets matched the latest live source byte for byte.
- Embedded credentials were checked: Supabase keys in client code have the public `anon` role; no service-role credentials are included.
- The npm lockfile passed an offline clean-install dry run.

The live app was not changed, and no reader SQL was executed against the real Supabase database. The Vercel project/domain, database setup and reader import, confirmation email delivery, and a real reader login still need to be completed/checked in the owner's accounts during deployment. Follow `START-HERE.md`.

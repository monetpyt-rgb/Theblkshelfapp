# Put The BLK Shelf on Vercel

This is the complete app, adapted for your own Vercel account. It includes all pages and the latest changes through October 3, 2026 (live app version 21).

1. Unzip **The-BLK-Shelf-Vercel.zip**. Upload the contents of its `The-BLK-Shelf` folder into a new GitHub repository. `package.json` should be at the top level of that repository.
2. In your **existing Supabase project**, have your team run `supabase/reader-schema.sql` in the SQL Editor. This creates the reader tables and their privacy rules. Your website's book/author catalog remains connected.
3. Unzip the **separate private reader backup**. Run its `reader-import.sql` in that same Supabase project after step 2. This transfers the saved profiles and shelves from the old app. Keep that backup off GitHub.
4. In Vercel, create a project and import the new GitHub repository. Choose **Next.js**, **Node.js 24**, and build command `npm run build`. Copy the two `NEXT_PUBLIC_SUPABASE_...` values from `.env.example` into Vercel's environment variables.
5. Deploy. Add the new Vercel URL (and your final custom domain, if you use one) to Supabase's allowed authentication redirect URLs. Set the production app URL as the Supabase Site URL when ready to switch readers over. Retain any other legitimate website login redirects.
6. Test signing in, saving books, favoriting authors, changing reading status, and writing a review before sharing the new link.

**Reader login accounts stay in your existing Supabase project.** Readers use their current email/password. Their saved data is restored by step 3. They will need to sign in on the new app address.

The backup is a dated snapshot. If readers save more books before you move, get a fresh backup for the final transfer. The old app and new app use separate reader databases until the move is finished.

The complete technical instructions are in `README.md`.

# Temo – Lesotho Farmer Community App (BIDT3110)

Phase 1 – Foundation (Supabase backend, auth, RLS, marketplace/orders/community).
Phase 2 – **Cybersecurity: enforced RBAC, separate Security Portal, GDPR rights, classification/GDPR/access spreadsheets.**
The Figma design is preserved; the simulated parts are now backed by a real database.

## 1. Set up Supabase (≈10 min)

1. Supabase dashboard → **SQL Editor → New query**. Paste all of `supabase/001_schema.sql` → **Run**.
   (Made a mistake? Run `supabase/000_reset.sql` on this dev project, then run 001 again.)
2. **Authentication → Providers → Email**: for development turn **off "Confirm email"**
   (otherwise users must click an email link before they can log in).
3. **Authentication → URL Configuration**: Site URL = `http://localhost:8443` for now (change to your Vercel URL after deploying).
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

## 2. Run it in VS Code

```bash
pnpm install            # installs @supabase/supabase-js and updates pnpm-lock.yaml
cp .env.example .env    # then paste the URL + anon key into .env
pnpm dev                # http://localhost:8443
```

> Commit the updated `pnpm-lock.yaml` – Vercel installs with a frozen lockfile and fails if it is out of date.
> Never put the `service_role` key in this project; only the anon key belongs in the frontend.

## 3. First run checklist

1. Register a **farmer** (pick a district, add a farm name) → you land on the Home screen with live weather.
2. Run `supabase/002_demo_data.sql` (SQL Editor) to load the sample listings and posts from the Figma design.
3. Register a second account as a **buyer** (use a private window). Buy something → log back in as the farmer →
   **Profile → My orders → Selling → Accept → Ready for pickup** → buyer **Confirm receipt**.
4. Make yourself admin: edit the email in `supabase/003_make_admin.sql` and run it (needed for Phase 3's security portal).

## What changed vs the Figma prototype

| Area | Before | Now |
|---|---|---|
| Login / roles | none | Supabase Auth, farmer/buyer sign-up, roles `farmer · buyer · agri_officer · admin` |
| Marketplace | hardcoded array | `products` table, image upload to Storage, search/category/district filters, save products |
| Buy now | fake confirmation | `place_order()` → order workflow `pending → accepted → processing → completed` (stock updated server-side) |
| Community | local state | posts, likes, replies persisted; shows real names/districts |
| Profile | hardcoded "Mpho" | real profile, edit modal, live stats, My listings, My orders, Saved products, log out |
| Home | fixed weather & April text | Open-Meteo weather for the user's district, season-aware guidance (Sept–Nov = spring planting) |
| Security | none | RLS on every table, no self-promotion to admin, audit log, consent record at sign-up |

See `docs/PHASE1_NOTES.md` for the schema map, security rules and test cases.

## Phase 2 setup (add to what you already did)

1. Supabase SQL Editor → run `supabase/004_security.sql` (after 001, and after you registered your first account).
2. Make yourself admin: edit the email in `supabase/003_make_admin.sql` and run it.
3. Security portal:
   ```bash
   cd security-portal
   cp .env.example .env      # same Supabase URL + anon key
   npm install
   npm run dev               # http://localhost:5174  (log in with the admin account)
   ```
4. In the portal: *My security* → enrol an authenticator, then *Access policies* → `require_admin_mfa` (optional).
5. Fill in the evidence on `docs/spreadsheets/Temo_Access_Control_Matrix.xlsx` → *Security Test Cases*.

Docs: `docs/PHASE2_NOTES.md` (what/where/evidence), `docs/DEPLOY.md` (two Vercel projects), spreadsheets in `docs/spreadsheets/`.

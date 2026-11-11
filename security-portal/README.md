# Temo Security Portal
Separate admin application for the Temo Farmer Community App (BIDT3110 Part C2).
Same Supabase backend, different origin and deployment. Admin accounts only.

```bash
cp .env.example .env   # paste the same Supabase URL + anon key
npm install
npm run dev            # http://localhost:5174
```
First admin: run `supabase/003_make_admin.sql` (with your email) in the Supabase SQL Editor.
Pages: Dashboard · Users · Roles & permissions · Access policies · Audit logs · Incidents · Moderation · My security (2FA).
See `../docs/PHASE2_NOTES.md` and `../docs/DEPLOY.md`.

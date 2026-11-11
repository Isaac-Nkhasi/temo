# Phase 2 – Cybersecurity (BIDT3110 Part C, 25 marks)

| Requirement | Marks | Where it is delivered |
|---|---|---|
| C1 Data classification (Public / Private / Confidential / Restricted) in a spreadsheet | 8 | `docs/spreadsheets/Temo_Data_Classification.xlsx` |
| C2 Read/write permissions per actor + security configuration module on a different domain | 12 | `security-portal/` (own Vercel project/domain), `supabase/004_security.sql`, `docs/spreadsheets/Temo_Access_Control_Matrix.xlsx` |
| C3 GDPR compliance levels in a spreadsheet | 5 | `docs/spreadsheets/Temo_GDPR_Compliance.xlsx` + in-app export/erasure |

## What was added

**Database (`supabase/004_security.sql`)**
- `has_permission(module, 'read'|'write')` – the RBAC matrix (`role_permissions`) is now *enforced* in RLS for community, marketplace, farmer profiles and `place_order()`. Flip a tick in the portal → behaviour changes on the next request.
- `security_policies` – `registration_open`, `require_verified_sellers`, `max_active_listings_per_seller`, `admin_idle_timeout_minutes`, `min_password_length`, `require_admin_mfa`.
- `security_incidents` – breach register with 72-hour tracking (GDPR Art. 33).
- Audit triggers for permission changes, policy changes, incidents and post moderation (on top of role/status/order events from Phase 1).
- Admins cannot change their own role/status; admin row of the matrix is locked by a CHECK constraint.
- GDPR rights: `export_my_data()` (Art. 15/20) and `delete_my_account()` (Art. 17).
- Admin-only RPCs: `admin_list_users`, `admin_update_user`, `admin_dashboard`, `admin_list_posts`, `admin_set_post_hidden`, `portal_log`.

**Farmer app (`src/`)**: *Profile → Privacy & my data* (privacy notice, consent history, download my data, delete my account); UI follows the permission matrix (Sell button, posting, ordering); friendlier error when a database rule blocks an action.

**Security Portal (`security-portal/`)** – a separate React app: dashboard, user management (role/status/verified), roles & permissions matrix, access policies, audit log (search + CSV export), incident register, content moderation, "My security" (TOTP 2FA enrolment). Admin-only (checked in the UI *and* by every RPC/RLS policy), idle timeout from policy, own session storage key, strict security headers in `vercel.json`.

## Evidence checklist for the report / presentation
1. `Temo_Access_Control_Matrix.xlsx` → *Security Test Cases*: run all 18 tests, paste screenshots, set Pass/Fail (the counters update).
2. Portal screenshots: dashboard, permission matrix, a policy toggle, audit log showing `permission.changed`.
3. Two browser tabs showing two different domains (farmer app vs portal) – the "different domain" requirement.
4. GDPR: screenshot of *Download my data* JSON and of the erasure result.

## Design notes worth saying out loud in the presentation
- Security is enforced in PostgreSQL (RLS + SECURITY DEFINER functions), not in React; hiding buttons is only cosmetic.
- Least privilege: public views expose only non-sensitive columns; orders can't be edited directly; audit logging can't be forged by users.
- Two apps share one backend but not one origin: separate session storage, separate deployment, separate CSP.

## Known limitations (be honest about these in the report)
- 2FA is available and can be required by policy, but is not mandatory by default.
- No automated retention schedule; no penetration test; processor agreements (Supabase/Vercel) not yet reviewed – all marked in the GDPR sheet.
- Read permissions in the matrix drive the UI; the database enforces *write* permissions and row ownership (reads are protected by RLS/views).
- Platform-level rate limiting/brute-force protection relies on Supabase Auth defaults.

# Phase 1 notes

## Database map (supabase/001_schema.sql)

| Table / view | Purpose | Classification (for Phase 3 spreadsheet) |
|---|---|---|
| `districts` | 10 Lesotho districts + coordinates | Public |
| `profiles` | name, phone, district, role, status, farm details | Private |
| `products`, `market_listings` (view) | marketplace listings | Public |
| `posts`, `comments`, `post_likes`, `community_feed` / `comments_feed` (views) | community | Public |
| `product_saves` | a user's saved products | Private |
| `orders` | buyer/seller, quantities, totals, status | Confidential |
| `blockchain_records` | hash + tx hash per completed order (filled in Phase 4) | Confidential (hash itself is verifiable/public on-chain) |
| `consent_records` | GDPR consent evidence | Private |
| `role_permissions` | RBAC matrix (editable by admin in Phase 3) | Restricted |
| `audit_logs` | role/status/order events | Restricted |
| `auth.users` (Supabase-managed) | password hashes, tokens | Restricted |

## Security rules enforced in the database (not in React)

- Sign-up can only create `farmer` or `buyer`. A BEFORE UPDATE trigger blocks users changing their own `role`, `status` or `verified_seller`; every change is written to `audit_logs`.
- `profiles` rows are readable only by the owner and admins. Other users see names/districts only through the `market_listings` and `community_feed` views (no phone numbers).
- Only farmers/admins can create listings; sellers edit/remove only their own.
- `orders` has **no** insert/update policy: all changes go through `place_order()` and `set_order_status()`, which validate who may make which transition and adjust stock atomically.
- Storage: users can upload only into their own `<user-id>/` folder of `product-images`.
- Suspended accounts can no longer write (policies call `is_active()`).

## Test cases to screenshot as evidence

1. Farmer tries `update profiles set role='admin'` from the browser console → error `42501`.
2. Buyer cannot see another user's phone: `select phone from profiles` returns only their own row.
3. Buyer tries to accept their own order (`set_order_status(..., 'accepted')`) → "Invalid status change".
4. Ordering more than the stock → error; accepting an order reduces stock; cancelling after acceptance restores it.
5. Unauthenticated request to `orders` returns nothing / permission denied.

## Known limitations (intentional, scheduled later)

- Admin/officer UI: Phase 3 (separate security portal on its own domain). Roles exist and are enforced by RLS now.
- Blockchain: table exists, nothing writes to it yet (Phase 4).
- AI: the Learn "Open guide" buttons are placeholders until Phase 5.
- Right-to-access / right-to-erasure UI: Phase 3 (GDPR spreadsheet will record these as *Partial* until then).
- Direct messaging is a placeholder button.

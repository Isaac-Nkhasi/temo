# Deploying Temo (two apps, one backend)

You need **two Vercel projects** from the same GitHub repo. Different projects get different domains – that is the "security module on a different domain" requirement.

| | Farmer app | Security portal |
|---|---|---|
| Vercel *Root Directory* | `./` (repo root) | `security-portal` |
| Framework preset | Vite | Vite |
| Install / build | default (`pnpm install`, `pnpm build`) | `npm install`, `npm run build` (or pnpm) |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | same two values |
| Example domain | `temo-farmers.vercel.app` or `temo.yourdomain.com` | `temo-security.vercel.app` or `security.yourdomain.com` |

Steps
1. Push the project to GitHub (commit both lockfiles: run `pnpm install` in the root and in `security-portal/` first).
2. Vercel → *Add New Project* → import the repo → set Root Directory → add the two env vars → Deploy. Repeat for the second project.
3. Supabase → Authentication → URL Configuration: set **Site URL** to the farmer app and add **both** deployed URLs (and `http://localhost:8443`, `http://localhost:5174`) under *Redirect URLs*.
4. If you own a domain: Vercel → Project → Domains → add `temo.yourdomain.com` / `security.yourdomain.com` and create the DNS records Vercel shows.
5. Re-enable *Confirm email* in Supabase Auth for production if you want email verification.
6. Never add the `service_role` key to either project.

## Local development
```bash
# farmer app           → http://localhost:8443
pnpm install && pnpm dev
# security portal      → http://localhost:5174
cd security-portal && cp .env.example .env && npm install && npm run dev
```

## Blockchain (Part B)
The order registry anchors a `sha256` hash of each **completed** order — no personal data goes on-chain.

1. Deploy the contract to a testnet:
   ```bash
   cd blockchain
   cp .env.example .env          # paste a throwaway, funded testnet key
   npm install
   npm test                      # contract test suite (local, no funds needed)
   npm run deploy:sepolia        # or: npm run deploy:amoy
   ```
   Note the printed `REGISTRY_ADDRESS` and `CHAIN_ID`. The deployer is a recorder by default.

2. Deploy the two edge functions (repo root, Supabase CLI logged in):
   ```bash
   supabase functions deploy anchor-order
   supabase functions deploy verify-order
   ```

3. Set the function secrets (server-side only):
   ```bash
   supabase secrets set \
     RPC_URL="https://ethereum-sepolia-rpc.publicnode.com" \
     REGISTRY_ADDRESS="0x..." \
     CHAIN_ID=11155111 \
     ANCHOR_PRIVATE_KEY="0x..."
   ```
   `ANCHOR_PRIVATE_KEY` is a **restricted** secret — never put it in either front end.

4. In the app, a completed order shows an **On-chain ✓** badge with its transaction hash and explorer link; **Verify** re-hashes the order and checks it against the contract.

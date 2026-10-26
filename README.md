# Neko Pro (HackMeridian fork)

Neko Pro is the verified-investor tier of Neko, the investing app on Stellar where people in Latin America earn in dollars from $5. At HackMeridian 2026 we added the investor side of Neko's tokenization project: a wallet passes KYC, gets an on-chain identity, browses the real-world asset vaults launched from Neko Launchpad and invests in them on Stellar testnet.

- Live: https://hackmeridian.tryneko.io (testnet)
- Project overview, the issuer Launchpad, admin, contracts and the evidence pack: [neko-tokenization-hackmeridian](https://github.com/Neko-Protocol/neko-tokenization-hackmeridian) (start with its README and [docs/evidence.md](https://github.com/Neko-Protocol/neko-tokenization-hackmeridian/blob/main/docs/evidence.md))

This repository is a fork of Neko's existing web app, which runs on Stellar mainnet. The git tag `pre-hackmeridian` (`7a7fad2`) marks the code that existed before the event; the hackathon work is the diff from that tag to `main` (`git diff --stat pre-hackmeridian..main`). The mainnet app's users and deposits are not adoption of the new tokenization flow.

## What the investor does

1. **Verify.** `/pro` asks for KYC (Didit, or a mock for the demo). The backend records the approval and then registers the wallet on chain: an identity contract, signed KYC and AML claims, and an entry in the shared identity registry. The page tells the investor that whitelisting registers the wallet on Stellar.
2. **Browse.** Opportunities come from the backend's list of vaults launched through the Launchpad factory, read live from the vault contracts: target, minimum raise, amount raised, repayment schedule and state.
3. **Invest.** The investor signs `invest` with their own wallet (Stellar Wallets Kit). The vault takes USDC and mints vault tokens one for one. The token contract refuses a wallet without an on-chain identity, so the gate is enforced by the contract, not only by the page.
4. **Exit.** Depending on the vault state the same screen offers `refund` (raise failed), `early_exit` (active, with the exit fee shown before signing) or `redeem` (fully repaid). Every action links to its transaction on stellar.expert.

## Where the code is

| Path                                              | What it does                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `src/app/(app)/pro/`                               | Routes: opportunities list and opportunity detail                     |
| `src/features/shared/pro/hooks/useProVerification.ts`, `useProAccess.ts` | KYC, on-chain registration and access state                          |
| `src/features/shared/pro/services/opportunities.service.ts` | Launched vaults from the backend                                      |
| `src/features/shared/pro/services/vaultReader.ts`  | Live reads from the vault contracts                                   |
| `src/features/shared/pro/services/vaultActions.ts` | `invest`, `refund`, `early_exit`, `redeem`, with contract errors mapped to plain messages |
| `src/lib/contracts/neko-tokenization/`             | Generated vault bindings                                              |
| `src/app/api/backend-proxy/[...path]/route.ts`     | Forwards `/v1/*` to the backend with the internal key                 |
| `supabase/migrations/`                             | Shared database. Launchpad tables are `0029` to `0033`                 |
| `messages/`                                        | English and Spanish copy                                              |

## Run it

```bash
cp .env.example .env.local     # BACKEND_INTERNAL_URL, BACKEND_INTERNAL_KEY, NEXT_PUBLIC_PRO_STELLAR_RPC_URL, Privy and Supabase keys
export GITHUB_PACKAGES_TOKEN=  # read:packages, for @neko-protocol/* in .npmrc
npm ci
npm run dev                    # http://localhost:3000/pro
npm run build
npm run lint
```

The proxy reads `BACKEND_INTERNAL_URL` (not `BACKEND_URL`, which the Launchpad and admin use).

## Known limits

- Testnet only. The vaults use test USDC from the platform issuer.
- No compliance modules (investor count, country rules) are registered on the token yet; the contract enforces identity, and the vault caps the raise.
- Lint reports 0 errors and 74 warnings in older, pre-event parts of the app; warnings are tracked as debt from the fork.
- No CI workflow or root license in this repository yet (pending a decision).

## License

MIT, see [LICENSE](LICENSE).

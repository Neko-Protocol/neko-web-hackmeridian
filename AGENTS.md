# Agent guide

For coding agents working in this repository. Product context and evidence are in the main repository: https://github.com/Neko-Protocol/neko-tokenization-hackmeridian.

- Hackathon code is Neko Pro: `src/app/(app)/pro/`, `src/features/shared/pro/`, `src/lib/contracts/neko-tokenization/` and migrations `0029` to `0033`. The rest is the pre-existing Neko app (tag `pre-hackmeridian`).
- Install needs `GITHUB_PACKAGES_TOKEN` (read:packages). Run `npm run lint` and `npm run build` before a pull request; lint errors outside Pro are older debt, do not add new ones.
- The browser never calls the backend directly: use `/api/backend-proxy/v1/...`, which reads `BACKEND_INTERNAL_URL` and `BACKEND_INTERNAL_KEY`.
- Server data goes through TanStack Query, wallet state through `@neko-protocol/stellar-wallet`. User-facing copy lives in `messages/` in English and Spanish.
- New database tables: add the next numbered migration in `supabase/migrations`.
- Never commit secrets or private keys. Plain language in copy, no em dashes.

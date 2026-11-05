# Two-developer workflow

Time: about 34 hours to the Sat 2026-11-07 09:00 IST deadline. Two people, so the rule is: **own folders, share interfaces, merge often.**

## Ownership
| Dev | Owns (only they edit; others open a PR) | Also does |
|---|---|---|
| **A: chain** | `contracts/`, `packages/invoice-lib/`, `apps/server/src/chain/`, `gate/`, `tools/` | deploy and verify contract, live Gate 1, WBT/USDT funding, relayer budget |
| **B: product** | `apps/web/`, `sdk/`, `examples/merchant-demo/`, `apps/server/src/api/`, `apps/server/src/shared/store.ts` | UI copy, EXAMPLE DATA labelling, CSV, webhooks, demo script |
| **Shared** | `docs/`, root `package.json`, `README.md`, `WHITECHAIN_FEEDBACK.md`, `CLAUDE.md` | A and B each edit only their own sections / lines |
`docs/INTERFACES.md` is the contract. Changing it needs the other developer's OK in the same PR.

## Branches and merging
- `main` always builds and its tests pass. Nobody force-pushes `main`.
- Work on short branches: `a/<topic>` and `b/<topic>`. Merge to `main` at least every 2 to 3 hours (small PRs, squash or rebase).
- Before merging: `git pull --rebase origin main`, run your own tests, run `npm run check` once it exists.
- Commit often with a real message (judges read the history). Each developer commits under their own git identity.
- **Commit size rule: no commit may insert or delete more than 1000 lines** (ETHGlobal flags giant commits). Aim for a few hundred. Run `npm run setup:hooks` once per clone so oversized commits are blocked, and `npm run check:commits` before merging. Never vendor dependencies; add them in small batches so the lockfile change stays under the limit.
- Lockfile conflict: do not hand-merge; run `npm install` again and commit the result.
- Never commit `.env`, keys, or `node_modules`.

## Mock-first so nobody waits
- **B never waits for the contract.** Use `CHAIN_MODE=mock` and the committed ABI stub. The buyer page, merchant dashboard and verify page are built against scripted results.
- **A never waits for the UI.** Test through Foundry tests and a small CLI that creates, signs, authorizes and settles an invoice.
- **Interface hour (first 1 to 2 hours, together):** agree `docs/INTERFACES.md`, commit the ABI stub (`contracts/abi/`), create the first golden vector, and agree the domain-file and link formats.

## Checkpoints
| When (IST) | Goal | Owner of the check |
|---|---|---|
| Nov 6, about 01:00 | Interfaces frozen, ABI stub and first vector committed, both can start | both |
| Nov 6, about 09:00 | **Integration 1:** a script creates a signed invoice, authorizes, settles on Sepolia, hash matches in TS and Solidity | A leads |
| Nov 6, about 19:00 | **Integration 2:** browser end to end (create, PASS, sign, pay, status, CSV), verify page works | B leads |
| Nov 7, about 02:00 | **Feature freeze.** Only fixes, README, feedback file, demo | both |
| Nov 7, 02:00 to 06:00 | Polish, README, `WHITECHAIN_FEEDBACK.md`, record demo (2 to 4 min), rerun radar | both |
| Nov 7, 07:00 to 08:00 | Submit (select Whitechain, repo link, video). Buffer before 09:00 | both |
Sleep in shifts; whoever is awake owns `main`.

## Daily rhythm
Every 3 to 4 hours: 10-minute sync, tick the checklist in `CLAUDE.md` (own lines only), merge branches, say what is blocked.
If blocked on the other person's piece for more than 15 minutes, use the mock and keep going.

## Definition of done per slice
- Contract: tests pass, deployed and verified on chain 1874, ABI committed, explorer link in the README.
- Chain module: works against Sepolia and has a mock; simulates before sending; no key in the repo.
- API/UI: works with `CHAIN_MODE=mock` and with `testnet`; example data is labelled; errors are readable.
- Docs: any claim in the README is either tested or marked "not tested".

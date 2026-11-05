# How AI was used in this project

We used **Claude Code (Anthropic)** as an assistant during the hackathon. The decisions about scope, direction and what to submit are the team's.

## Where AI helped
- **Research and planning:** prior-art and market research, comparing Whitechain with other chains, and drafting the planning documents in this repo (`docs/SPEC.md`, `docs/MARKET-RESEARCH.md`, `docs/archive/`). Sources and uncertainty are noted in those documents.
- **Scripts:** `gate/gate1.mjs` (a Gate 1 test of the signed-transfer feature on the track USDT) and `tools/competitor-radar.js` (a read-only scan of recently verified contracts).
- **Code:** assistance writing and testing the contracts, library, relayer and web app as the build proceeds (this file is updated when that happens).

## Planning artifacts
All specs, research notes and prompts that shaped the project are kept in `docs/` so the work can be audited. A superseded earlier design is kept in `docs/archive/` for history.

## What we did not do
- We did not copy other teams' contracts. We read some public contracts on the testnet only to assess overlap and wrote ours from scratch.
- Example merchants, clients and invoices in the demo are fictional and labelled as examples.

## Team review
_Team to complete: how code is reviewed and tested by humans before submission._

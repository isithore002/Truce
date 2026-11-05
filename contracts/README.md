# contracts

Foundry project for `InvoiceSettler` (written from scratch; see `../docs/SPEC.md` section 4 for the design).

- `forge build` / `forge test`
- Config: solc 0.8.28, evm prague, RPC alias `whitechain_testnet`.
- `lib/forge-std` is a git submodule (vendoring it would break our commit-size rule). After cloning run `git submodule update --init --recursive`. OpenZeppelin will be added the same way with the first contract.

# B. Diagrams (Mermaid)

C4 diagrams use flowcharts with C4-style labels because Mermaid's native C4 syntax is still experimental and renders unevenly.

> **Validation status:** the diagrams were checked by hand against Mermaid syntax, **not** run through the Mermaid parser (installing it was not possible: the system drive is almost full). If one fails to render on GitHub, fix that block; the content is correct. Paste a block into https://mermaid.live to check it.

## B1. Use case diagram
```mermaid
flowchart LR
  Merchant(["Merchant"])
  Buyer(["Buyer"])
  Anyone(["Anyone, auditor, judge"])
  Relayer(["Relayer service"])
  subgraph Truce["Truce system boundary"]
    UC1(("Publish domain file"))
    UC2(("Create signed invoice"))
    UC3(("Open invoice link"))
    UC4(("Verify payee PASS or FAIL"))
    UC5(("Pay now with one signature"))
    UC6(("Pay on due date"))
    UC7(("Check scheduled payment health"))
    UC8(("Cancel scheduled payment"))
    UC9(("View status and export CSV"))
    UC10(("Refund buyer"))
    UC11(("Check an invoice publicly"))
    UC12(("Settle on chain"))
    UC13(("Warn when merchant keys change"))
  end
  Merchant --> UC1
  Merchant --> UC2
  Merchant --> UC9
  Merchant --> UC10
  Buyer --> UC3
  Buyer --> UC5
  Buyer --> UC6
  Buyer --> UC8
  Anyone --> UC11
  Relayer --> UC12
  Relayer --> UC7
  UC3 -. include .-> UC4
  UC5 -. include .-> UC4
  UC11 -. include .-> UC4
  UC5 -. include .-> UC12
  UC6 -. extend .-> UC5
  UC7 -. extend .-> UC6
  UC13 -. extend .-> UC4
```

## B2. System context (C4 level 1)
```mermaid
flowchart TB
  M(["Merchant: small agency"])
  B(["Buyer: finance or ops lead"])
  V(["Verifier: anyone"])
  T["Truce<br/>Verify the payee, pay gaslessly, track settlement"]
  D["Merchant domain<br/>serves /.well-known/truce.json"]
  W["Whitechain Sepolia 1874<br/>InvoiceSettler and track USDT"]
  X["Blockscout explorer<br/>transaction and contract pages"]
  K["Wallet: MetaMask or Rabby<br/>signs typed data"]
  F["Faucet and YetiTrade<br/>setup only: test WBT and USDT"]
  M -->|"creates invoices, publishes file"| T
  B -->|"verifies and pays"| T
  V -->|"checks invoices"| T
  T -->|"fetches domain file over HTTPS"| D
  T -->|"simulates and sends transactions"| W
  T -->|"links to"| X
  B -->|"signs with"| K
  K --> T
  M -.->|"funds test wallets"| F
```

## B3. Containers and components (C4 levels 2 and 3)
```mermaid
flowchart TB
  subgraph Browser["Browser"]
    WEB["apps/web<br/>React and Vite: merchant, buyer, verify pages<br/>pins stored in localStorage"]
    DEMO["examples/merchant-demo<br/>about 20 lines using the SDK"]
  end
  SDK["sdk<br/>createInvoice"]
  LIB["packages/invoice-lib<br/>types, hash, sign, verify, domain check"]
  subgraph Server["apps/server: one Node process"]
    API["src/api<br/>Fastify routes, validation"]
    DV["Domain verifier<br/>https only, SSRF guard, cache"]
    SVC["Invoice service<br/>status machine, CSV"]
    CHAIN["src/chain<br/>ChainModule"]
    STORE[("JSON file store<br/>behind Store interface")]
  end
  subgraph ChainParts["src/chain components"]
    SIM["Simulator"]
    SUB["Submitter"]
    SCH["Scheduler"]
    HC["Health checker"]
    BG["Budget guard and rate limiter"]
  end
  CONTRACT["contracts: InvoiceSettler"]
  TOKEN["Track USDT EIP-3009"]
  WEB --> API
  DEMO --> SDK --> API
  WEB --> LIB
  API --> LIB
  API --> DV
  API --> SVC --> STORE
  SVC --> CHAIN
  CHAIN --> SIM --> SUB
  CHAIN --> SCH --> HC
  CHAIN --> BG
  SUB --> CONTRACT --> TOKEN
  HC --> TOKEN
  SCH --> SVC
```

## B4. Sequence diagrams

### B4.1 Merchant setup and invoice creation
```mermaid
sequenceDiagram
  actor M as Merchant
  participant W as Web app
  participant K as Wallet
  participant A as API
  participant S as Store
  M->>W: connect wallet, enter domain and payout address
  W->>W: generate truce.json with signing and payout wallets
  W-->>M: download file, upload to /.well-known/ on the domain
  M->>W: fill invoice form
  W->>K: signTypedData Invoice
  K-->>W: signature
  W->>A: POST /api/invoices document
  A->>A: validate, recompute hash, check memo hash
  A->>S: put document, status ISSUED
  A-->>W: hash and payment link
  W-->>M: show link and EXAMPLE DATA banner if example
```

### B4.2 Buyer verifies, happy path (PASS)
```mermaid
sequenceDiagram
  actor B as Buyer
  participant W as Web app
  participant A as API
  participant D as Merchant domain
  B->>W: open payment link
  W->>A: GET /api/verify?hash
  A->>D: GET https domain /.well-known/truce.json
  D-->>A: signingAddress, payoutAddresses, chainIds
  A->>A: run checks, signature, merchant, payout, domainHash, chain, token, expiry, memo, payer
  A-->>W: PASS with checklist and pin status
  W-->>B: invoice details and green PASS
```

### B4.3 Attack: swapped payout (FAIL in the app, revert on chain)
```mermaid
sequenceDiagram
  actor X as Attacker
  actor B as Buyer
  participant W as Web app
  participant A as API
  participant R as Relayer chain module
  participant C as InvoiceSettler
  X->>B: email copy with payout changed
  B->>W: open the tampered link
  W->>A: verify document
  A->>A: signature recovers to merchant only for the original payout
  A-->>W: FAIL signature_invalid and payout_not_in_domain_file
  W-->>B: red FAIL, payment button disabled
  Note over X,C: Even if verification is bypassed
  X->>R: settle with swapped payout and valid buyer authorization
  R->>R: simulate first
  R-->>X: simulation reverts BadMerchantSignature, nothing sent
  X->>C: direct settle call
  C-->>X: revert BadMerchantSignature
```

### B4.4 Pay now
```mermaid
sequenceDiagram
  actor B as Buyer
  participant W as Web app
  participant K as Wallet
  participant A as API
  participant R as Chain module
  participant C as InvoiceSettler
  participant T as USDT token
  B->>W: click Pay now after PASS
  W->>K: signTypedData ReceiveWithAuthorization, to InvoiceSettler, nonce invoiceHash
  K-->>W: v r s
  W->>A: POST authorize mode now
  A->>R: settle document and authorization
  R->>R: simulate, check budget and rate limit
  R->>C: settle invoice, merchantSig, auth
  C->>C: check expiry, token, payer lock, unpaid, merchant signature
  C->>T: receiveWithAuthorization from buyer to contract
  C->>T: transfer amount to signed payout
  C-->>R: event InvoicePaid
  R-->>A: tx hash
  A->>A: status PAID, audit event
  A-->>W: receipt with explorer link
```

### B4.5 Pay on due date with health checks and failure path (SHOULD)
```mermaid
sequenceDiagram
  actor B as Buyer
  participant W as Web app
  participant A as API
  participant S as Scheduler and health checker
  participant T as USDT token
  participant C as InvoiceSettler
  actor M as Merchant
  B->>W: sign authorization with validAfter equal dueDate
  W->>A: POST authorize mode due
  A->>A: status SCHEDULED_OK
  loop before due date
    S->>T: balanceOf buyer, authorizationState, isBlocked
    alt balance below amount
      S->>A: status AT_RISK reason LOW_BALANCE
      A-->>M: dashboard badge AT RISK
    else healthy
      S->>A: status SCHEDULED_OK
    end
  end
  S->>C: settle at due time
  alt settle succeeds
    C-->>S: InvoicePaid
    S->>A: status PAID
  else settle reverts, for example empty wallet
    C-->>S: revert
    S->>A: status FAILED with reason and retry timer
    S->>C: retry until validBefore
    alt still failing at expiry
      S->>A: status EXPIRED
    end
  end
```

### B4.6 Buyer cancels a scheduled payment (SHOULD)
```mermaid
sequenceDiagram
  actor B as Buyer
  participant W as Web app
  participant K as Wallet
  participant A as API
  participant R as Chain module
  participant T as USDT token
  B->>W: click Cancel scheduled payment
  W->>K: signTypedData CancelAuthorization
  K-->>W: v r s
  W->>A: POST cancel
  A->>R: cancelAuthorization from, nonce, signature
  R->>T: cancelAuthorization, relayer pays gas
  T-->>R: authorization marked used
  R-->>A: tx hash
  A->>A: status CANCELLED
```

### B4.7 Refund (SHOULD, contract and tests only)
```mermaid
sequenceDiagram
  actor M as Merchant payout wallet
  participant R as Chain module
  participant C as InvoiceSettler
  participant T as USDT token
  actor B as Original payer
  M->>R: sign receiveWithAuthorization payout to contract, nonce from invoice hash and refunded so far
  R->>C: refund hash, amount, authorization
  C->>C: payment exists, signer is payout, refunded plus amount at most paid
  C->>T: receiveWithAuthorization payout to contract
  C->>T: transfer amount to original payer
  C-->>R: event Refunded with total refunded
  T-->>B: refund received
```

## B5. Data model (ER)
```mermaid
erDiagram
  INVOICE ||--o| AUTHORIZATION : "has at most one active"
  INVOICE ||--o| PAYMENT : "settles into"
  PAYMENT ||--o{ REFUND : "may have"
  INVOICE ||--o{ HEALTH_CHECK : "is checked by"
  INVOICE ||--o{ EVENT : "records"
  INVOICE }o--|| DOMAIN_CACHE : "verified against"
  INVOICE {
    string hash PK
    string invoiceId
    string merchant
    string payout
    string token
    string amount
    int dueDate
    int expiry
    string payer
    string domain
    string domainHash
    string memoHash
    string signature
    json details
    string status
    boolean example
    int createdAt
  }
  AUTHORIZATION {
    string invoiceHash FK
    string mode
    string fromAddress
    string validAfter
    string validBefore
    int v
    string r
    string s
    string state
  }
  PAYMENT {
    string invoiceHash PK
    string txHash
    int blockNumber
    string payer
    string payout
    string amount
    int paidAt
  }
  REFUND {
    string id PK
    string invoiceHash FK
    string amount
    string txHash
    int createdAt
  }
  HEALTH_CHECK {
    string id PK
    string invoiceHash FK
    int at
    boolean ok
    string reason
    string balance
  }
  EVENT {
    string id PK
    string invoiceHash FK
    int at
    string type
    json data
  }
  DOMAIN_CACHE {
    string domain PK
    string signingAddress
    json payoutAddresses
    json chainIds
    int fetchedAt
  }
```
Browser-only data (not in the ER): key pins in `localStorage`, keyed by domain.

## B6. State machine: invoice status
```mermaid
stateDiagram-v2
  [*] --> ISSUED : merchant creates invoice
  ISSUED --> PAID : pay now settles
  ISSUED --> SCHEDULED_OK : buyer authorizes for due date
  ISSUED --> EXPIRED : expiry passes unpaid
  SCHEDULED_OK --> AT_RISK : health check finds a problem
  AT_RISK --> SCHEDULED_OK : problem fixed
  SCHEDULED_OK --> PAID : collected at due time
  AT_RISK --> PAID : collected at due time
  SCHEDULED_OK --> FAILED : settle reverts at due time
  AT_RISK --> FAILED : settle reverts at due time
  FAILED --> PAID : retry succeeds
  FAILED --> EXPIRED : validBefore passes
  SCHEDULED_OK --> CANCELLED : buyer cancels
  AT_RISK --> CANCELLED : buyer cancels
  PAID --> PARTIALLY_REFUNDED : refund below amount paid
  PARTIALLY_REFUNDED --> REFUNDED : refunds reach amount paid
  PAID --> REFUNDED : full refund
  EXPIRED --> [*]
  CANCELLED --> [*]
  REFUNDED --> [*]
```

## B7. Deployment diagram
```mermaid
flowchart TB
  subgraph Dev["Developer machine, Windows with Git Bash"]
    VITE["Vite dev server :5173<br/>apps/web"]
    SRV["Node server :8787<br/>API, relayer, scheduler<br/>JSON file store, .env with throwaway key"]
    FOR["Foundry: forge build, test, deploy"]
    FIX["Fixtures: example merchant domains"]
  end
  subgraph Net["Networks"]
    SEP["Whitechain Sepolia 1874<br/>rpc.testnet.whitechain.io, backup Ankr"]
    L1["Ethereum Sepolia<br/>settlement layer, not touched directly"]
    EXP["explorer.testnet.whitechain.io<br/>Blockscout"]
    FCT["faucet.testnet.whitechain.io"]
  end
  subgraph Opt["Optional hosting, UNVERIFIED tiers"]
    HOST["Static web host and Node host"]
  end
  VITE -->|"HTTP"| SRV
  SRV -->|"JSON-RPC, 50 req/s per IP"| SEP
  FOR -->|"deploy and verify"| SEP
  FOR -->|"verify via /api/"| EXP
  SEP -.->|"batches"| L1
  SRV --> FIX
  FCT -.->|"test WBT"| SRV
  HOST -.->|"stretch"| SRV
```
Environments: **local mock** (`CHAIN_MODE=mock`, no network), **testnet** (`CHAIN_MODE=testnet`, real chain 1874), **demo** (testnet with example fixtures and the EXAMPLE DATA banner). No mainnet.

## B8. Trust boundaries and threat model
```mermaid
flowchart LR
  subgraph U["Untrusted"]
    EM["Invoice link or email copy<br/>T1 swapped payout"]
    DM["Merchant domain<br/>T2 lookalike, T3 compromised"]
    BR["Browser and wallet UI<br/>T8 blind signing"]
    NET["Internet callers<br/>T4 abuse, T10 SSRF"]
  end
  subgraph S["Semi-trusted: our server"]
    API2["API and domain verifier<br/>T10 SSRF"]
    REL["Relayer key and budget<br/>T4 gas drain, T9 key exposure"]
    ST["Store with off-chain details<br/>T7 tampered memo"]
  end
  subgraph T["Trusted by construction: chain"]
    CT["InvoiceSettler<br/>T5 replay, T6 malicious token"]
    TK["Track USDT EIP-3009"]
  end
  EM --> API2
  DM --> API2
  BR --> API2
  NET --> API2
  API2 --> REL --> CT --> TK
  API2 --> ST
```
The mitigations for T1 to T10 are in `C-TECHNICAL.md` section 7.

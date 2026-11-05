#!/usr/bin/env node
// Competitor radar for Whitechain Sepolia: lists recently verified contracts and flags overlap with our features.
// Usage:  node tools/competitor-radar.js [--pages 4] [--since 2026-11-05T00:00:00Z] [--deep] [--net testnet|mainnet]
// No dependencies (Node 18+). Read-only: only GET requests to the public Blockscout API.
// --deep downloads each matching contract's verified source and prints which features it uses.
// This tool treats downloaded source as text only. It never executes it.

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const flag = (name) => args.includes(name);

const NET = opt('--net', 'testnet');
const BASE = NET === 'mainnet' ? 'https://explorer.whitechain.io' : 'https://explorer.testnet.whitechain.io';
const PAGES = parseInt(opt('--pages', '4'), 10);
const SINCE = opt('--since', '2026-11-05T00:00:00Z');
const DEEP = flag('--deep');

// Contract names worth a look (payments, invoices, checkout, subscriptions, receivables, refunds, relayers).
const NAME_HINTS = /invoice|checkout|pay|merchant|bill|receipt|refund|subscri|pull|relay|receivable|mandate|ledger|khata|settle|order/i;

// Features we compare against. "domain" = verifies a merchant against its own domain / DNS (our differentiator).
const FEATURES = {
  'domain/DNS verification': /well-known|\.well-known|dnssec|\bTXT\b|domainHash|merchantDomain|dns/i,
  'merchant-signed order/invoice': /merchantSig|vendorSig|SignatureChecker|isValidSignatureNow/i,
  'EIP-3009 pull': /receiveWithAuthorization|transferWithAuthorization/i,
  'Permit2 / allowance pull': /Permit2|PermitSingle|AllowanceTransfer/i,
  'invoice-bound nonce': /invoiceHash|payNonce|orderId.*nonce|nonce.*orderId/i,
  'due date': /dueDate|due_date/i,
  'scheduled / subscription': /subscription|renew|schedule/i,
  'refund': /function\s+refund/i,
  'dispute': /openDispute|resolveDispute/i,
  'operator registry': /MerchantRegistry|VERIFIER_ROLE|onlyOwner[\s\S]{0,80}register/i,
  'stealth / privacy': /stealth|ERC5564|Announcement\(/i,
};

async function get(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function listVerified() {
  const out = [];
  let params = '';
  for (let p = 0; p < PAGES; p++) {
    const d = await get(`${BASE}/api/v2/smart-contracts?filter=solidity${params}`);
    out.push(...(d.items || []));
    if (!d.next_page_params) break;
    params = '&' + new URLSearchParams(Object.entries(d.next_page_params).map(([k, v]) => [k, String(v)])).toString();
  }
  return out;
}

async function analyse(addr) {
  const c = await get(`${BASE}/api/v2/smart-contracts/${addr}`);
  const files = [c.source_code || '', ...(c.additional_sources || []).filter(s => !/node_modules/.test(s.file_path)).map(s => s.source_code || '')];
  const src = files.join('\n');
  const hits = Object.entries(FEATURES).filter(([, re]) => re.test(src)).map(([k]) => k);
  return { sourceChars: src.length, hits };
}

(async () => {
  console.log(`Radar on ${BASE}  since ${SINCE}  pages=${PAGES}  deep=${DEEP}\n`);
  const items = (await listVerified()).filter(x => (x.verified_at || '') >= SINCE);
  const seen = new Set();
  let flagged = 0;
  for (const x of items) {
    const name = (x.address && x.address.name) || x.name || '?';
    const addr = (x.address && x.address.hash) || x.address_hash;
    const hint = NAME_HINTS.test(name);
    const key = name + (hint ? '' : addr);
    if (!hint) continue;
    if (seen.has(key) && !DEEP) continue;
    seen.add(key);
    flagged++;
    let line = `${(x.verified_at || '').slice(0, 16)}  ${name.padEnd(24)} ${addr}  txs=${x.transactions_count ?? 'n/a'}`;
    if (DEEP) {
      try { const a = await analyse(addr); line += `\n    features: ${a.hits.join(', ') || '(none matched)'}`; if (a.hits.includes('domain/DNS verification')) line += '\n    !!! POSSIBLE DOMAIN-VERIFICATION OVERLAP: read this source carefully'; }
      catch (e) { line += `\n    (source fetch failed: ${e.message})`; }
    }
    console.log(line);
  }
  console.log(`\n${flagged} payment/invoice-like contracts verified since ${SINCE} (out of ${items.length} verified).`);
  console.log('Re-run before submitting. If "domain/DNS verification" appears on someone else, reconsider the pitch angle.');
})().catch(e => { console.error('Radar failed:', e.message); process.exit(1); });

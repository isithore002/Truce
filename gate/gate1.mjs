// GATE 1: can we redeem a signed EIP-3009 authorization on the track USDT (Whitechain Sepolia, chain 1874)?
//
//   node gate1.mjs                       read-only checks, NO keys needed (domain, version, permit surface)
//   node --env-file=.env gate1.mjs       also sends 1 real tx: receiveWithAuthorization (needs PAYER_PK, RECEIVER_PK)
//   node --env-file=.env gate1.mjs --cancel   also tests gasless cancelAuthorization (1 more tx)
//
// Use THROWAWAY testnet keys only. Never put a real key in .env. The script refuses any chain id other than 1874.
// Why receiver must submit: receiveWithAuthorization requires msg.sender == `to`. Our InvoiceSettler contract will be that `to`.

import { createPublicClient, createWalletClient, http, defineChain, hashDomain, parseSignature, keccak256, toHex, formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const RPC = process.env.RPC_URL || 'https://rpc.testnet.whitechain.io';
const TOKEN = getAddress('0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7'); // track USDT
const CHAIN_ID = 1874;
const AMOUNT = BigInt(process.env.AMOUNT_UNITS || '10000'); // 0.01 USDT (6 decimals)
const EXPLORER = 'https://explorer.testnet.whitechain.io';
const DO_CANCEL = process.argv.includes('--cancel');

const chain = defineChain({
  id: CHAIN_ID, name: 'Whitechain Sepolia',
  nativeCurrency: { name: 'WBT', symbol: 'WBT', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http(RPC) });

const abi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'DOMAIN_SEPARATOR', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nonces', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'isBlocked', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'authorizationState', stateMutability: 'view', inputs: [{ name: 'authorizer', type: 'address' }, { name: 'nonce', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'receiveWithAuthorization', stateMutability: 'nonpayable', inputs: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'cancelAuthorization', stateMutability: 'nonpayable', inputs: [
    { name: 'authorizer', type: 'address' }, { name: 'nonce', type: 'bytes32' },
    { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' }], outputs: [] },
];

const results = [];
let liveRan = false; // GATE 1 only counts as passed if the live redemption actually ran
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };
const rand32 = () => toHex(randomBytes(32));
const splitSig = (sig) => { const p = parseSignature(sig); return { v: 27 + Number(p.yParity ?? (p.v === 28n ? 1 : 0)), r: p.r, s: p.s }; };

const RECEIVE_TYPES = { ReceiveWithAuthorization: [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] };
const CANCEL_TYPES = { CancelAuthorization: [{ name: 'authorizer', type: 'address' }, { name: 'nonce', type: 'bytes32' }] };

async function mustRevert(label, run) {
  try { await run(); record(label, false, 'expected a revert but the call would succeed'); }
  catch (e) { record(label, true, 'reverted as expected: ' + String(e.shortMessage || e.message).split('\n')[0].slice(0, 110)); }
}

async function main() {
  const cid = await pub.getChainId();
  if (cid !== CHAIN_ID) throw new Error(`Refusing to run: RPC chain id is ${cid}, expected ${CHAIN_ID} (Whitechain Sepolia).`);
  console.log(`Chain ${cid} OK via ${RPC}\nToken ${TOKEN}\n`);

  // ---- READ-ONLY CHECKS (no keys) ----
  const [name, symbol, decimals, onchainSep] = await Promise.all([
    pub.readContract({ address: TOKEN, abi, functionName: 'name' }),
    pub.readContract({ address: TOKEN, abi, functionName: 'symbol' }),
    pub.readContract({ address: TOKEN, abi, functionName: 'decimals' }),
    pub.readContract({ address: TOKEN, abi, functionName: 'DOMAIN_SEPARATOR' }),
  ]);
  record('token metadata', decimals === 6, `${name} / ${symbol} / ${decimals} decimals`);

  let version = null;
  for (const v of ['1', '2', '3']) {
    const local = hashDomain({ domain: { name, version: v, chainId: CHAIN_ID, verifyingContract: TOKEN },
      types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }] } });
    if (local.toLowerCase() === onchainSep.toLowerCase()) { version = v; break; }
  }
  record('EIP-712 domain reconstructed locally', !!version, version ? `name="${name}", version="${version}", chainId=${CHAIN_ID}, verifyingContract=token (proxy)` : 'no match for versions 1-3: check name/version assumptions before signing anything');
  try { const n = await pub.readContract({ address: TOKEN, abi, functionName: 'nonces', args: [TOKEN] }); record('permit surface present (fallback path)', true, `nonces() readable (${n})`); }
  catch { record('permit surface present (fallback path)', false, 'nonces() not readable: permit fallback may be unavailable'); }
  try { const used = await pub.readContract({ address: TOKEN, abi, functionName: 'authorizationState', args: [TOKEN, rand32()] }); record('authorizationState readable', used === false, 'fresh nonce reports unused'); }
  catch (e) { record('authorizationState readable', false, e.shortMessage || e.message); }

  if (!process.env.PAYER_PK || !process.env.RECEIVER_PK) {
    console.log('\nNo PAYER_PK / RECEIVER_PK set: stopping after read-only checks. See .env.example for the live test.');
    return finish();
  }

  // ---- LIVE TEST (testnet only, throwaway keys) ----
  liveRan = true;
  const payer = privateKeyToAccount(process.env.PAYER_PK);
  const receiver = privateKeyToAccount(process.env.RECEIVER_PK);
  const wallet = createWalletClient({ account: receiver, chain, transport: http(RPC) });
  console.log(`\nLive test. payer=${payer.address}  receiver(msg.sender, pays gas)=${receiver.address}  amount=${formatUnits(AMOUNT, 6)} USDT`);
  const [payerUsdt, recvWbt, blockedP, blockedR] = await Promise.all([
    pub.readContract({ address: TOKEN, abi, functionName: 'balanceOf', args: [payer.address] }),
    pub.getBalance({ address: receiver.address }),
    pub.readContract({ address: TOKEN, abi, functionName: 'isBlocked', args: [payer.address] }).catch(() => false),
    pub.readContract({ address: TOKEN, abi, functionName: 'isBlocked', args: [receiver.address] }).catch(() => false),
  ]);
  record('preconditions', payerUsdt >= AMOUNT && recvWbt > 10n ** 15n && !blockedP && !blockedR,
    `payer USDT=${formatUnits(payerUsdt, 6)}, receiver WBT=${formatUnits(recvWbt, 18)}, blocked=${blockedP || blockedR}`);
  if (!(payerUsdt >= AMOUNT && recvWbt > 10n ** 15n)) return finish();

  const domain = { name, version, chainId: CHAIN_ID, verifyingContract: TOKEN };
  const now = (await pub.getBlock()).timestamp;
  const sign = async (to, nonce, validAfter, validBefore) => {
    const message = { from: payer.address, to, value: AMOUNT, validAfter, validBefore, nonce };
    return splitSig(await payer.signTypedData({ domain, types: RECEIVE_TYPES, primaryType: 'ReceiveWithAuthorization', message }));
  };
  const callArgs = (nonce, validAfter, validBefore, sig) => [payer.address, receiver.address, AMOUNT, validAfter, validBefore, nonce, sig.v, sig.r, sig.s];

  // 1) the real redemption
  const nonce = rand32(); const validAfter = 0n; const validBefore = now + 600n;
  const sig = await sign(receiver.address, nonce, validAfter, validBefore);
  const before = await pub.readContract({ address: TOKEN, abi, functionName: 'balanceOf', args: [receiver.address] });
  const hash = await wallet.writeContract({ address: TOKEN, abi, functionName: 'receiveWithAuthorization', args: callArgs(nonce, validAfter, validBefore, sig) });
  const rc = await pub.waitForTransactionReceipt({ hash });
  const after = await pub.readContract({ address: TOKEN, abi, functionName: 'balanceOf', args: [receiver.address] });
  const used = await pub.readContract({ address: TOKEN, abi, functionName: 'authorizationState', args: [payer.address, nonce] });
  record('receiveWithAuthorization redeemed on chain', rc.status === 'success' && after - before === AMOUNT && used === true, `${EXPLORER}/tx/${hash}`);

  // 2) negative tests (simulation only, no gas spent)
  await mustRevert('replay of the same authorization is rejected', () => pub.simulateContract({ account: receiver, address: TOKEN, abi, functionName: 'receiveWithAuthorization', args: callArgs(nonce, validAfter, validBefore, sig) }));
  const n2 = rand32(); const s2 = await sign(receiver.address, n2, validAfter, validBefore);
  await mustRevert('only the payee (msg.sender == to) can redeem', () => pub.simulateContract({ account: payer, address: TOKEN, abi, functionName: 'receiveWithAuthorization', args: callArgs(n2, validAfter, validBefore, s2) }));
  const n3 = rand32(); const s3 = await sign(receiver.address, n3, now + 3600n, now + 7200n);
  await mustRevert('not redeemable before validAfter (due-date collection works)', () => pub.simulateContract({ account: receiver, address: TOKEN, abi, functionName: 'receiveWithAuthorization', args: callArgs(n3, now + 3600n, now + 7200n, s3) }));
  const n4 = rand32(); const s4 = await sign(receiver.address, n4, 0n, now + 1n);
  await new Promise(r => setTimeout(r, 4000));
  await mustRevert('expired authorization is rejected', () => pub.simulateContract({ account: receiver, address: TOKEN, abi, functionName: 'receiveWithAuthorization', args: callArgs(n4, 0n, now + 1n, s4) }));

  // 3) optional: gasless cancel by signature, submitted by someone else
  if (DO_CANCEL) {
    const n5 = rand32(); const s5 = await sign(receiver.address, n5, 0n, now + 3600n);
    const cs = splitSig(await payer.signTypedData({ domain, types: CANCEL_TYPES, primaryType: 'CancelAuthorization', message: { authorizer: payer.address, nonce: n5 } }));
    const ch = await wallet.writeContract({ address: TOKEN, abi, functionName: 'cancelAuthorization', args: [payer.address, n5, cs.v, cs.r, cs.s] });
    const crc = await pub.waitForTransactionReceipt({ hash: ch });
    const cancelled = await pub.readContract({ address: TOKEN, abi, functionName: 'authorizationState', args: [payer.address, n5] });
    record('cancelAuthorization by signature (relayed by another account)', crc.status === 'success' && cancelled === true, `${EXPLORER}/tx/${ch}`);
    await mustRevert('redeeming a cancelled authorization is rejected', () => pub.simulateContract({ account: receiver, address: TOKEN, abi, functionName: 'receiveWithAuthorization', args: callArgs(n5, 0n, now + 3600n, s5) }));
  }
  return finish();
}

function finish() {
  const failed = results.filter(r => !r.ok);
  if (!liveRan) console.log(`\nREAD-ONLY CHECKS: ${failed.length === 0 ? 'PASS' : 'FAIL (' + failed.length + ')'}. GATE 1 is NOT passed yet: the live redemption has not run.`);
  else console.log(`\nGATE 1: ${failed.length === 0 ? 'PASS' : 'FAIL (' + failed.length + ' check(s))'}`);
  if (failed.length) console.log('If receiveWithAuthorization itself failed, use the permit + transferFrom fallback and keep the rest of the plan.');
  writeFileSync('gate1-result.json', JSON.stringify({ at: new Date().toISOString(), token: TOKEN, results }, null, 2));
  console.log('Saved gate1-result.json (use it in WHITECHAIN_FEEDBACK.md).');
  process.exitCode = failed.length ? 1 : 0;
}

main().catch(e => { console.error('Gate script error:', e.shortMessage || e.message); process.exit(2); });

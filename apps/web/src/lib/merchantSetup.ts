import type { Address, DomainFile } from './api/types';
import { ADDR } from './api/fixtures';
import { config } from './config';
import { isAddress } from './format';
import { normaliseDomain } from './pins';

/** The merchant's own setup (domain, name, payout), kept in this browser to prefill the invoice form. */
export interface MerchantSetup {
  domain: string;
  name: string;
  payout: Address | '';
}

const KEY = 'truce.merchant.v1';

export const EXAMPLE_SETUP: MerchantSetup = { domain: 'northlight-design.example', name: 'Northlight Design Studio', payout: ADDR.northlightPayout };

export function loadSetup(): MerchantSetup {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as MerchantSetup;
  } catch {
    /* ignore */
  }
  return config.apiMode === 'mock' ? EXAMPLE_SETUP : { domain: '', name: '', payout: '' };
}

export function saveSetup(s: MerchantSetup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function validateDomain(d: string): string | undefined {
  const n = normaliseDomain(d);
  if (!n) return 'Enter the domain your customers know, for example acme.com';
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(n)) return 'That does not look like a domain name';
  return undefined;
}

export function buildDomainFile(s: MerchantSetup, signingAddress: Address): DomainFile | undefined {
  if (!isAddress(s.payout)) return undefined;
  return { version: 1, name: s.name.trim(), signingAddress, payoutAddresses: [s.payout], chainIds: [1874] };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

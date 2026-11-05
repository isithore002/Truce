import type { Address } from './api/types';
import { sameAddress } from './format';

/**
 * Key pinning (docs/INTERFACES.md section 3): after a payment the browser remembers
 * domain -> { signingAddress, payoutAddresses }. A later invoice from the same domain is compared against it.
 * Stored only in this browser (localStorage); nothing is sent to a server.
 */

export interface Pin {
  signingAddress: Address;
  payoutAddresses: Address[];
  pinnedAt: string;
}

export type PinMap = Record<string, Pin>;

export type PinCheck =
  | { state: 'NEW' }
  | { state: 'MATCH'; pin: Pin }
  | {
      state: 'CHANGED';
      pin: Pin;
      signingChanged: boolean;
      payoutChanged: boolean;
      current: { signingAddress: Address; payout: Address };
    };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PIN_KEY = 'truce.pins.v1';

const memory = new Map<string, string>();
const memoryStore: KeyValueStore = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

function defaultStore(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* storage disabled: fall back to memory */
  }
  return memoryStore;
}

export const normaliseDomain = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

export function readPins(store: KeyValueStore = defaultStore()): PinMap {
  try {
    const raw = store.getItem(PIN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as PinMap) : {};
  } catch {
    return {};
  }
}

export function getPin(domain: string, store?: KeyValueStore): Pin | undefined {
  return readPins(store)[normaliseDomain(domain)];
}

export function comparePin(
  domain: string,
  current: { signingAddress: Address; payout: Address },
  store?: KeyValueStore,
): PinCheck {
  const pin = getPin(domain, store);
  if (!pin) return { state: 'NEW' };
  const signingChanged = !sameAddress(pin.signingAddress, current.signingAddress);
  const payoutChanged = !pin.payoutAddresses.some((p) => sameAddress(p, current.payout));
  if (!signingChanged && !payoutChanged) return { state: 'MATCH', pin };
  return { state: 'CHANGED', pin, signingChanged, payoutChanged, current };
}

/**
 * Save after a successful payment. A new signing wallet replaces the pin (the buyer confirmed the change);
 * a new payout under the same signer is added to the list.
 */
export function savePin(
  domain: string,
  value: { signingAddress: Address; payoutAddresses: Address[] },
  store: KeyValueStore = defaultStore(),
  now = new Date(),
): Pin {
  const pins = readPins(store);
  const key = normaliseDomain(domain);
  const prev = pins[key];
  const keepOld = prev && sameAddress(prev.signingAddress, value.signingAddress) ? prev.payoutAddresses : [];
  const payoutAddresses = [...keepOld];
  for (const p of value.payoutAddresses) if (!payoutAddresses.some((q) => sameAddress(q, p))) payoutAddresses.push(p);
  const pin: Pin = { signingAddress: value.signingAddress, payoutAddresses, pinnedAt: now.toISOString() };
  pins[key] = pin;
  store.setItem(PIN_KEY, JSON.stringify(pins));
  return pin;
}

export function forgetPin(domain: string, store: KeyValueStore = defaultStore()): void {
  const pins = readPins(store);
  delete pins[normaliseDomain(domain)];
  store.setItem(PIN_KEY, JSON.stringify(pins));
}

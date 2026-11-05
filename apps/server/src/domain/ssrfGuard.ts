import { BlockList, isIP } from "node:net";

/** Address ranges a server-side fetch must never reach: private, loopback, link-local, metadata, reserved. */
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** Pulls the IPv4 address out of ::ffff:a.b.c.d or ::ffff:aabb:ccdd and NAT64 64:ff9b::/96 forms. */
function embeddedV4(ip: string): string | undefined {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return undefined;
}

/** True if `ip` must not be fetched. Anything that is not a valid IP address counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true;
  if (family === 4) return blocked.check(ip, "ipv4");
  const v4 = embeddedV4(ip);
  if (v4) return blocked.check(v4, "ipv4");
  return blocked.check(ip, "ipv6");
}

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/**
 * Normalizes a merchant domain for fetching. Accepts only a plain lowercase hostname with at least one dot:
 * no scheme, port, path, user info, IP literal or trailing dot. Returns undefined otherwise.
 */
export function normalizeDomain(input: string): string | undefined {
  const d = input.trim().toLowerCase();
  if (!HOSTNAME.test(d)) return undefined;
  if (isIP(d) !== 0) return undefined;
  if (d === "localhost" || d.endsWith(".localhost") || d.endsWith(".local") || d.endsWith(".internal")) return undefined;
  return d;
}

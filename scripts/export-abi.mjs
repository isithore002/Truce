// Writes contracts/abi/InvoiceSettler.json (ABI only) from the Foundry artifact.
// Run after `cd contracts && forge build`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifact = join(root, "contracts", "out", "InvoiceSettler.sol", "InvoiceSettler.json");
const target = join(root, "contracts", "abi", "InvoiceSettler.json");

if (!existsSync(artifact)) {
  console.log("No InvoiceSettler artifact yet (build it with `forge build` once the contract exists). Nothing exported.");
  process.exit(0);
}

const { abi } = JSON.parse(readFileSync(artifact, "utf8"));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(abi, null, 2) + "\n");
console.log(`Wrote ${target} (${abi.length} entries)`);

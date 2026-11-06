// Counts the non-blank, non-comment lines between the "integration start" and "integration end" markers of a file.
import { readFileSync } from "node:fs";
const file = process.argv[2];
if (!file) throw new Error("usage: node count-integration-lines.mjs <file>");
const lines = readFileSync(file, "utf8").split(/\r?\n/);
const start = lines.findIndex((l) => l.includes("integration start"));
const end = lines.findIndex((l) => l.includes("integration end"));
if (start < 0 || end < start) throw new Error("markers not found");
const code = lines.slice(start + 1, end).filter((l) => l.trim() && !l.trim().startsWith("//"));
console.log(`${code.length} lines of integration code in ${file}`);
if (code.length > 20) process.exit(1);

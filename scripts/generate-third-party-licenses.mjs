import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageLock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const entries = [];

for (const [packagePath, metadata] of Object.entries(packageLock.packages ?? {})) {
  if (!packagePath || !metadata.version) continue;
  const name = metadata.name ?? packagePath.split("node_modules/").at(-1);
  entries.push({
    ecosystem: "npm",
    name,
    version: metadata.version,
    license: metadata.license ?? "See package source",
  });
}

const cargoExecutable = process.env.CARGO || (process.platform === "win32"
  ? resolve(process.env.USERPROFILE ?? "", ".cargo/bin/cargo.exe")
  : "cargo");
const cargoMetadata = JSON.parse(execFileSync(cargoExecutable, [
  "metadata",
  "--format-version", "1",
  "--locked",
  "--manifest-path", resolve(root, "src-tauri/Cargo.toml"),
], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }));
const workspacePackages = new Set(cargoMetadata.workspace_members);

for (const metadata of cargoMetadata.packages) {
  if (workspacePackages.has(metadata.id)) continue;
  entries.push({
    ecosystem: "Cargo",
    name: metadata.name,
    version: metadata.version,
    license: metadata.license ?? "See crate source",
  });
}

const uniqueEntries = [...new Map(entries.map((entry) => [
  `${entry.ecosystem}:${entry.name}:${entry.version}`,
  entry,
])).values()].sort((left, right) =>
  left.ecosystem.localeCompare(right.ecosystem) || left.name.localeCompare(right.name),
);

const output = resolve(root, "src/generated/thirdPartyLicenses.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(uniqueEntries, null, 2)}\n`);
console.log(`Generated ${uniqueEntries.length} third-party licence entries.`);

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../fhevm-hardhat-template");
const deploymentsDir = resolve(root, "deployments");

function loadJson(p) { return JSON.parse(readFileSync(p, "utf8")); }

function main() {
  const networks = ["sepolia", "localhost", "hardhat"];
  const outDir = resolve(process.cwd(), "src/abi");
  const abiOut = resolve(outDir, "SaveWaterABI.ts");
  const addrOut = resolve(outDir, "SaveWaterAddresses.ts");
  const badgeAbiOut = resolve(outDir, "SaveWaterBadgeABI.ts");
  const badgeAddrOut = resolve(outDir, "SaveWaterBadgeAddresses.ts");

  /** Try read SaveWater artifact from any network */
  let abi;
  for (const n of networks) {
    try {
      const p = resolve(deploymentsDir, n, "SaveWater.json");
      const j = loadJson(p);
      abi = j.abi; break;
    } catch {}
  }
  if (!abi) throw new Error("SaveWater ABI not found. Deploy first.");

  writeFileSync(abiOut, `export const SaveWaterABI = ${JSON.stringify({ abi }, null, 2)} as const;\n`);

  const mapping = {};
  for (const n of networks) {
    try {
      const p = resolve(deploymentsDir, n, "SaveWater.json");
      const j = loadJson(p);
      mapping[n] = { address: j.address, chainId: j.network?.chainId };
    } catch {}
  }
  writeFileSync(addrOut, `export const SaveWaterAddresses = ${JSON.stringify(mapping, null, 2)} as const;\n`);

  // SaveWaterBadge
  let badgeAbi;
  for (const n of networks) {
    try {
      const p = resolve(deploymentsDir, n, "SaveWaterBadge.json");
      const j = loadJson(p);
      badgeAbi = j.abi; break;
    } catch {}
  }
  if (badgeAbi) {
    writeFileSync(badgeAbiOut, `export const SaveWaterBadgeABI = ${JSON.stringify({ abi: badgeAbi }, null, 2)} as const;\n`);
    const badgeMapping = {};
    for (const n of networks) {
      try {
        const p = resolve(deploymentsDir, n, "SaveWaterBadge.json");
        const j = loadJson(p);
        badgeMapping[n] = { address: j.address, chainId: j.network?.chainId };
      } catch {}
    }
    writeFileSync(badgeAddrOut, `export const SaveWaterBadgeAddresses = ${JSON.stringify(badgeMapping, null, 2)} as const;\n`);
  }
}

main();



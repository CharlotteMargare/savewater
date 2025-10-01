import { ethers } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const deploymentsDir = resolve(__dirname, "../deployments/sepolia");
  const badgeJson = JSON.parse(readFileSync(resolve(deploymentsDir, "SaveWaterBadge.json"), "utf8"));
  const address: `0x${string}` = badgeJson.address;

  const [signer] = await ethers.getSigners();
  console.log(`Using signer: ${await signer.getAddress()}`);
  console.log(`SaveWaterBadge @ ${address}`);

  const abi = [
    "function thresholds(uint8) view returns (uint32)",
    "function setThreshold(uint8 level, uint32 value) external",
  ];

  const badge = new ethers.Contract(address, abi, signer);

  const current: bigint = await badge.thresholds(1);
  console.log(`Current level-1 threshold = ${current}`);
  if (current === 1n) {
    console.log("Already set to 1.");
    return;
  }

  const tx = await badge.setThreshold(1, 1);
  console.log(`Tx sent: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`Confirmed in block ${rc?.blockNumber}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});





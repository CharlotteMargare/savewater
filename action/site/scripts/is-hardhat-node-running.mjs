import { JsonRpcProvider } from "ethers";

const provider = new JsonRpcProvider("http://localhost:8545");
try {
  const block = await provider.getBlockNumber();
  console.log("Hardhat running. Block:", block);
} catch {
  console.error("Local Hardhat Node is not running at http://localhost:8545");
  process.exit(1);
}




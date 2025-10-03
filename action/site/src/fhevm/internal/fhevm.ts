import { JsonRpcProvider, ethers } from "ethers";
import { RelayerSDKLoader } from "./RelayerSDKLoader";

type FhevmInstance = any;

async function web3ClientVersion(rpcUrl: string) {
  const p = new JsonRpcProvider(rpcUrl);
  try { return await p.send("web3_clientVersion", []); } finally { p.destroy(); }
}

async function relayerMetadata(rpcUrl: string) {
  const p = new JsonRpcProvider(rpcUrl);
  try { return await p.send("fhevm_relayer_metadata", []); } finally { p.destroy(); }
}

export async function createFhevmInstance(providerOrUrl: ethers.Eip1193Provider | string, mockChains: Record<number, string> = { 31337: "http://localhost:8545" }): Promise<FhevmInstance> {
  const chainId = typeof providerOrUrl === "string"
    ? Number((await new JsonRpcProvider(providerOrUrl).getNetwork()).chainId)
    : Number.parseInt((await providerOrUrl.request({ method: "eth_chainId" })) as string, 16);

  const rpcUrl = typeof providerOrUrl === "string" ? providerOrUrl : mockChains[chainId];
  if (rpcUrl) {
    const version = await web3ClientVersion(rpcUrl);
    if (typeof version === "string" && version.toLowerCase().includes("hardhat")) {
      const meta = await relayerMetadata(rpcUrl);
      if (meta && typeof meta === "object") {
        const { createMockInstance } = await import("./mock/fhevmMock");
        return createMockInstance(rpcUrl, chainId, meta);
      }
    }
  }

  // Relayer SDK path
  const loader = new RelayerSDKLoader();
  await loader.load();
  await window.relayerSDK.initSDK();
  const instance = await window.relayerSDK.createInstance({
    ...window.relayerSDK.SepoliaConfig,
    network: providerOrUrl,
  });
  return instance;
}




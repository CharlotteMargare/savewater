import { JsonRpcProvider } from "ethers";
import { MockFhevmInstance } from "@fhevm/mock-utils";

export async function createMockInstance(rpcUrl: string, chainId: number, metadata: {
  ACLAddress: `0x${string}`;
  InputVerifierAddress: `0x${string}`;
  KMSVerifierAddress: `0x${string}`;
}) {
  const provider = new JsonRpcProvider(rpcUrl);
  return MockFhevmInstance.create(provider, provider, {
    aclContractAddress: metadata.ACLAddress,
    chainId,
    gatewayChainId: 55815,
    inputVerifierContractAddress: metadata.InputVerifierAddress,
    kmsContractAddress: metadata.KMSVerifierAddress,
    verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
    verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  });
}




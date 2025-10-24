"use client";

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { SaveWaterAddresses } from "@/abi/SaveWaterAddresses";

async function resolveSaveWaterAddress(provider: ethers.Eip1193Provider | undefined): Promise<`0x${string}`> {
  // 优先按链 ID 解析生成的地址映射
  try {
    if (provider) {
      const hex = (await provider.request({ method: "eth_chainId" })) as string;
      const chainId = parseInt(hex, 16);
      if (chainId === 11155111 && (SaveWaterAddresses as any).sepolia?.address) {
        return (SaveWaterAddresses as any).sepolia.address as `0x${string}`;
      }
      if (chainId === 31337 && (SaveWaterAddresses as any).localhost?.address) {
        return (SaveWaterAddresses as any).localhost.address as `0x${string}`;
      }
    }
  } catch {}
  // 回退到环境变量（若存在）
  const envAddr = process.env.NEXT_PUBLIC_SAVEWATER_ADDRESS as `0x${string}` | undefined;
  if (envAddr && envAddr.startsWith("0x")) return envAddr;
  // 最后兜底：使用 abi 导出的 sepolia 地址（仅开发方便）
  return (SaveWaterAddresses as any).sepolia?.address as `0x${string}`;
}

async function ensureContractDeployed(readProvider: ethers.BrowserProvider, address: `0x${string}`): Promise<boolean> {
  try {
    const code = await readProvider.getCode(address);
    return code && code !== "0x";
  } catch {
    return false;
  }
}

const SAVEWATER_ABI = [
  "function recordSave(uint32 descriptionId, bytes32 encryptedAmount, bytes proof, bool revealAmount) external",
  "function getTotalSaves() external view returns (uint256)",
  "function getUserCount(address user) external view returns (uint32)",
  "function getUserStreak(address user) external view returns (uint32)",
  "function getUserRecordsLength(address user) external view returns (uint256)",
  "function getUserRecord(address user, uint256 index) external view returns (uint256 timestamp, uint32 descriptionId, bytes32 amount, uint32 streak)",
  "function getUserTotalAmount(address user) external view returns (bytes32)",
  "function grantAccessForRecord(uint256 index, address grantee) external",
  "function grantAccessForTotal(address grantee) external"
];

const DESCRIPTION_MAP: Record<string, string> = {
  "1": "🚿 关闭水龙头刷牙",
  "2": "🧴 淋浴时关水擦肥皂",
  "3": "👕 使用节水洗衣机",
  "4": "🌧️ 收集雨水浇花",
  "5": "♻️ 其他节水行为"
};

export interface SaveWaterRecord {
  timestamp: number;
  descriptionId: number;
  description: string;
  amountHandle: string;
  streak: number;
  date: string;
  originalIndex: number; // 在合约数组中的原始索引
}

export function useSaveWater(
  provider: ethers.Eip1193Provider | undefined,
  signer: ethers.JsonRpcSigner | undefined,
  instance: any
) {
  const [records, setRecords] = useState<SaveWaterRecord[]>([]);
  const [totalSaves, setTotalSaves] = useState<number>(0);
  const [userCount, setUserCount] = useState<number>(0);
  const [userStreak, setUserStreak] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchStats = useCallback(async () => {
    if (!signer) return;

    try {
      const readProvider = new ethers.BrowserProvider(provider as any);
      const addr = await resolveSaveWaterAddress(provider);
      const isDeployed = await ensureContractDeployed(readProvider, addr);
      if (!isDeployed) {
        console.warn(`SaveWater 未在当前网络部署或地址无代码: ${addr}`);
        setTotalSaves(0); setUserCount(0); setUserStreak(0);
        return;
      }
      const contract = new ethers.Contract(addr, SAVEWATER_ABI, readProvider);
      
      const userAddress = await signer.getAddress();
      
      const [total, count, streak] = await Promise.all([
        contract.getTotalSaves(),
        contract.getUserCount(userAddress),
        contract.getUserStreak(userAddress)
      ]);

      setTotalSaves(Number(total));
      setUserCount(Number(count));
      setUserStreak(Number(streak));
    } catch (error) {
      console.error("获取统计数据失败:", error);
    }
  }, [provider, signer]);

  const fetchRecords = useCallback(async () => {
    if (!signer) return;

    setLoading(true);
    try {
      const readProvider = new ethers.BrowserProvider(provider as any);
      const addr = await resolveSaveWaterAddress(provider);
      const isDeployed = await ensureContractDeployed(readProvider, addr);
      if (!isDeployed) {
        console.warn(`SaveWater 未在当前网络部署或地址无代码: ${addr}`);
        setRecords([]);
        return;
      }
      const contract = new ethers.Contract(addr, SAVEWATER_ABI, readProvider);
      
      const userAddress = await signer.getAddress();
      const length = await contract.getUserRecordsLength(userAddress);
      const recordCount = Number(length);

      if (recordCount === 0) {
        setRecords([]);
        setLoading(false);
        return;
      }

      const formattedRecords: SaveWaterRecord[] = [];
      for (let i = 0; i < recordCount; i++) {
        const record = await contract.getUserRecord(userAddress, i);
        const timestamp = Number(record[0]);
        const descriptionId = Number(record[1]);
        const amountHandle = record[2];
        const streak = Number(record[3]);

        formattedRecords.push({
          timestamp,
          descriptionId,
          description: DESCRIPTION_MAP[descriptionId.toString()] || "未知行为",
          amountHandle,
          streak,
          date: new Date(timestamp * 1000).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          }),
          originalIndex: i,
        });
      }

      setRecords(formattedRecords.reverse()); // 最新的在前
    } catch (error) {
      console.error("获取记录失败:", error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [provider, signer]);

  // 解密单条记录的金额（需要用户签名授权）
  const decryptAmount = useCallback(async (recordOriginalIndex: number): Promise<string> => {
    if (!signer || !instance) {
      return "需要连接钱包";
    }

    try {
      const userAddress = await signer.getAddress();
      const addr = await resolveSaveWaterAddress(provider as any);
      const contract = new ethers.Contract(addr, SAVEWATER_ABI, signer);

      // 1. 获取记录的加密句柄（记录创建时已对创建者授权，无需重复授权）
      const record = await contract.getUserRecord(userAddress, recordOriginalIndex);
      const amountHandle = record[2];

      // 2. 生成解密签名（简化版，实际应使用 FhevmDecryptionSignature）
      const { publicKey, privateKey } = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 365;

      const eip712 = instance.createEIP712(
        publicKey,
        [addr],
        startTimestamp,
        durationDays
      );

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      // 3. 解密
      const tryDecrypt = async () => {
        const res = await instance.userDecrypt(
          [{ handle: amountHandle, contractAddress: addr }],
          privateKey,
          publicKey,
          signature,
          [addr],
          userAddress,
          startTimestamp,
          durationDays
        );
        const decryptedValue = res[amountHandle];
        return `${(Number(decryptedValue) / 1000).toFixed(1)} 升`;
      };

      try {
        return await tryDecrypt();
      } catch (e: any) {
        const msg = String(e?.message || e);
        // 若 dapp 合约未被授权此句柄，回退调用一次授权（覆盖历史记录情况）后重试
        if (msg.includes("not authorized to user decrypt handle")) {
          const tx = await contract.grantAccessForRecord(recordOriginalIndex, userAddress);
          await tx.wait();
          return await tryDecrypt();
        }
        throw e;
      }
    } catch (error) {
      console.error("解密失败:", error);
      return "解密失败";
    }
  }, [signer, instance]);

  // 解密累计加密总量
  const decryptTotalAmount = useCallback(async (): Promise<string> => {
    if (!signer || !instance) {
      return "需要连接钱包";
    }
    try {
      const userAddress = await signer.getAddress();
      const addr = await resolveSaveWaterAddress(provider as any);
      const contract = new ethers.Contract(addr, SAVEWATER_ABI, signer);

      const handle = await contract.getUserTotalAmount(userAddress);

      const { publicKey, privateKey } = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 365;
      const eip712 = instance.createEIP712(
        publicKey,
        [addr],
        startTimestamp,
        durationDays
      );
      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const tryDecrypt = async () => {
        const res = await instance.userDecrypt(
          [{ handle, contractAddress: addr }],
          privateKey,
          publicKey,
          signature,
          [addr],
          userAddress,
          startTimestamp,
          durationDays
        );
        const decryptedValue = res[handle];
        return `${(Number(decryptedValue) / 1000).toFixed(1)} 升`;
      };

      try {
        return await tryDecrypt();
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.includes("not authorized to user decrypt handle")) {
          const tx = await contract.grantAccessForTotal(userAddress);
          await tx.wait();
          return await tryDecrypt();
        }
        throw e;
      }
    } catch (error) {
      console.error("解密累计失败:", error);
      return "解密失败";
    }
  }, [signer, instance]);

  useEffect(() => {
    if (signer) {
      fetchStats();
      fetchRecords();
    }
  }, [signer, fetchStats, fetchRecords]);

  return {
    records,
    totalSaves,
    userCount,
    userStreak,
    loading,
    fetchRecords,
    fetchStats,
    decryptAmount,
    decryptTotalAmount
  };
}


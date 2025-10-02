"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { ethers } from "ethers";
import { createFhevmInstance } from "@/fhevm/internal/fhevm";
import { SaveWaterAddresses } from "@/abi/SaveWaterAddresses";
import { SaveWaterABI } from "@/abi/SaveWaterABI";
import { SaveWaterBadgeAddresses } from "@/abi/SaveWaterBadgeAddresses";
import { SaveWaterBadgeABI } from "@/abi/SaveWaterBadgeABI";
import { useSaveWater } from "@/hooks/useSaveWater";

function useResolvedSaveWaterAddress(provider: ethers.Eip1193Provider | undefined) {
  const [addr, setAddr] = useState<`0x${string}` | undefined>(undefined);
  useEffect(() => {
    const run = async () => {
      try {
        if (provider) {
          const hex = (await provider.request({ method: "eth_chainId" })) as string;
          const chainId = parseInt(hex, 16);
          if (chainId === 11155111 && (SaveWaterAddresses as any).sepolia?.address) {
            setAddr((SaveWaterAddresses as any).sepolia.address as `0x${string}`);
            return;
          }
          if (chainId === 31337 && (SaveWaterAddresses as any).localhost?.address) {
            setAddr((SaveWaterAddresses as any).localhost.address as `0x${string}`);
            return;
          }
        }
      } catch {}
      const envAddr = process.env.NEXT_PUBLIC_SAVEWATER_ADDRESS as `0x${string}` | undefined;
      if (envAddr && envAddr.startsWith("0x")) return setAddr(envAddr);
      setAddr((SaveWaterAddresses as any).sepolia?.address as `0x${string}`);
    };
    run();
  }, [provider]);
  return addr;
}

export default function Home() {
  const [currentPage, setCurrentPage] = useState("home");
  const [provider, setProvider] = useState<ethers.Eip1193Provider | undefined>(undefined);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | undefined>(undefined);
  const [instance, setInstance] = useState<any>(undefined);
  const [status, setStatus] = useState<string>("idle");
  const [account, setAccount] = useState<string | undefined>(undefined);
  
  const [description, setDescription] = useState("1");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // 使用 SaveWater hook 获取记录和统计
  const { records, totalSaves, userCount, userStreak, loading, fetchRecords, fetchStats, decryptAmount } = useSaveWater(provider, signer, instance);

  useEffect(() => {
    const w = window as any;
    if (w.ethereum) {
      const p = new ethers.BrowserProvider(w.ethereum);
      p.send("eth_requestAccounts", []).then(async () => {
        setProvider(w.ethereum as ethers.Eip1193Provider);
        const s = await p.getSigner();
        setSigner(s);
        setAccount(await s.getAddress());
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!provider) return;
    setStatus("initializing");
    createFhevmInstance(provider).then(setInstance).finally(() => setStatus("ready"));
  }, [provider]);

  const resolvedAddress = useResolvedSaveWaterAddress(provider);
  const isReady = useMemo(() => Boolean(instance && signer && resolvedAddress), [instance, signer, resolvedAddress]);

  // 解密 UI 状态
  const [decryptingIndex, setDecryptingIndex] = useState<number | null>(null);
  const [decryptedMap, setDecryptedMap] = useState<Record<number, string>>({});

  // 徽章状态
  const [badgeThresholdL1, setBadgeThresholdL1] = useState<number | null>(null);
  const [badgeMinting, setBadgeMinting] = useState(false);
  const [badgeMinted, setBadgeMinted] = useState(false);

  const resolvedBadgeAddress = useMemo(() => {
    // 仅处理 sepolia
    return (SaveWaterBadgeAddresses as any).sepolia?.address as `0x${string}` | undefined;
  }, []);

  useEffect(() => {
    const loadBadge = async () => {
      if (!provider || !resolvedBadgeAddress) return;
      try {
        const read = new ethers.BrowserProvider(provider as any);
        const code = await read.getCode(resolvedBadgeAddress);
        if (!code || code === "0x") return;
        const c = new ethers.Contract(resolvedBadgeAddress, SaveWaterBadgeABI.abi, read);
        const t1 = await c.thresholds(1);
        setBadgeThresholdL1(Number(t1));
        if (signer) {
          const user = await signer.getAddress();
          const minted = await c.minted(user, 1);
          setBadgeMinted(Boolean(minted));
        }
      } catch {}
    };
    loadBadge();
  }, [provider, signer, resolvedBadgeAddress]);

  // 排行榜（真实数据）
  const [topUsers, setTopUsers] = useState<{ address: string; count: number; badges: number }[]>([]);
  useEffect(() => {
    const loadLeaderboard = async () => {
      if (!provider || !resolvedAddress) return;
      try {
        const read = new ethers.BrowserProvider(provider as any);
        const code = await read.getCode(resolvedAddress);
        if (!code || code === "0x") return;
        const sw = new ethers.Contract(resolvedAddress, SaveWaterABI.abi, read);
        const res = await sw.getTopUsers();
        const addrs: string[] = res[0];
        const counts: bigint[] = res[1];

        let badgeCounts: number[] = new Array(addrs.length).fill(0);
        if (resolvedBadgeAddress) {
          const badge = new ethers.Contract(resolvedBadgeAddress, [
            "function minted(address,uint8) view returns(bool)",
          ], read);
          await Promise.all(addrs.map(async (u, i) => {
            try {
              const m1 = await badge.minted(u, 1);
              const m2 = await badge.minted(u, 2);
              const m3 = await badge.minted(u, 3);
              badgeCounts[i] = Number(!!m1) + Number(!!m2) + Number(!!m3);
            } catch {}
          }));
        }

        const list = addrs.map((a, i) => ({ address: a, count: Number(counts[i] ?? 0n), badges: badgeCounts[i] ?? 0 }));
        setTopUsers(list);
      } catch {}
    };
    loadLeaderboard();
  }, [provider, resolvedAddress, resolvedBadgeAddress]);

  const connectWallet = async () => {
    const w = window as any;
    if (w.ethereum) {
      try {
        await w.ethereum.request({ method: 'eth_requestAccounts' });
        const p = new ethers.BrowserProvider(w.ethereum);
        setProvider(w.ethereum);
        const s = await p.getSigner();
        setSigner(s);
        setAccount(await s.getAddress());
      } catch (e) {
        alert("连接钱包失败");
      }
    } else {
      alert("请安装 MetaMask 钱包");
    }
  };

  const handleCheckin = async () => {
    if (!isReady || !amount) return;
    
    setIsSubmitting(true);
    setMessage("正在加密数据...");

    try {
      const userAddr = await signer!.getAddress();
      const input = instance.createEncryptedInput(resolvedAddress!, userAddr);
      input.add64(BigInt(Math.floor(Number(amount) * 1000)));
      
      setMessage("正在生成证明...");
      const enc = await input.encrypt();

      setMessage("正在上链...");
      const contract = new ethers.Contract(
        resolvedAddress!,
        ["function recordSave(uint32 descriptionId, bytes32 encryptedAmount, bytes proof, bool revealAmount) external"],
        signer!
      );

      const tx = await contract.recordSave(Number(description), enc.handles[0], enc.inputProof, false);
      setMessage(`等待交易确认...`);
      await tx.wait();

      setMessage(`✅ 打卡成功！交易哈希: ${tx.hash.slice(0, 10)}...`);
      setAmount("");
      
      // 刷新记录和统计
      setTimeout(() => {
        fetchRecords();
        fetchStats();
        setMessage("");
      }, 2000);
    } catch (error: any) {
      setMessage(`❌ 打卡失败: ${error.message || "未知错误"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const navItems = [
    { id: "home", icon: "🏠", label: "首页" },
    { id: "checkin", icon: "💧", label: "打卡" },
    { id: "records", icon: "📝", label: "记录" },
    { id: "leaderboard", icon: "🏆", label: "排行" },
    { id: "badges", icon: "🎖️", label: "徽章" },
  ];

  return (
    <>
      {/* 流体背景泡泡 */}
      <div className="fluid-bg">
        <div className="bubble"></div>
        <div className="bubble"></div>
        <div className="bubble"></div>
        <div className="bubble"></div>
        <div className="bubble"></div>
      </div>

      {/* Logo 标题 */}
      <div className="logo-title">
        <span>💧</span>
        <span>SaveWater</span>
      </div>

      {/* 钱包状态 */}
      <div className={`wallet-badge ${account ? 'connected' : 'disconnected'}`}>
        {account 
          ? `🔗 ${account.slice(0, 6)}...${account.slice(-4)}`
          : "未连接钱包"}
      </div>

      {/* 浮动导航 */}
      <div className="floating-nav">
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => setCurrentPage(item.id)}
          >
            {item.icon}
            <div className="nav-tooltip">{item.label}</div>
          </div>
        ))}
      </div>

      <main style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "8rem 2rem 4rem",
        position: "relative",
        zIndex: 1
      }}>
        {/* 首页 */}
        {currentPage === "home" && (
          <div className="fade-in" style={{ display: "grid", gap: "2.5rem" }}>
            <div className="glass-card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
              <h1 style={{ 
                fontSize: "3.5rem", 
                fontWeight: 800, 
                color: "white",
                marginBottom: "1.5rem",
                textShadow: "0 4px 20px rgba(0,0,0,0.2)",
                lineHeight: 1.2
              }}>
                让每一滴水都有记录
              </h1>
              <p style={{ fontSize: "1.3rem", color: "rgba(255,255,255,0.95)", marginBottom: "2.5rem", fontWeight: 500 }}>
                链上节水打卡 · 链上保存 · 加密隐私
              </p>
              
              {!account ? (
                <button className="btn btn-primary" onClick={connectWallet}>
                  🚀 连接钱包 开始打卡
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => setCurrentPage("checkin")}>
                  💧 立即节水打卡
                </button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "2rem" }}>
              <div className="stat-card">
                <div className="stat-number">{totalSaves}</div>
                <div className="stat-label">总打卡次数</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{userCount}</div>
                <div className="stat-label">我的打卡</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{userStreak}</div>
                <div className="stat-label">连续天数</div>
              </div>
            </div>

            {/* 波浪分隔线 */}
            <div className="wave-divider">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
                <path fill="rgba(255,255,255,0.3)" fillOpacity="1" d="M0,96L48,112C96,128,192,160,288,186.7C384,213,480,235,576,213.3C672,192,768,128,864,128C960,128,1056,192,1152,197.3C1248,203,1344,149,1392,122.7L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
              </svg>
            </div>

            <div className="glass-card">
              <h2 style={{ color: "white", marginBottom: "2rem", fontSize: "2rem", fontWeight: 700 }}>🌊 参与流程</h2>
              <div style={{ display: "grid", gap: "1.5rem" }}>
                {[
                  { num: "01", title: "连接钱包", desc: "使用 MetaMask 连接 Sepolia 测试网" },
                  { num: "02", title: "节水打卡", desc: "记录每日节水行为与估计量，加密上链" },
                  { num: "03", title: "领取徽章", desc: "累积 7/30/100 次可铸造专属 NFT" }
                ].map((step) => (
                  <div key={step.num} style={{
                    display: "flex",
                    gap: "1.5rem",
                    alignItems: "center",
                    padding: "1.5rem",
                    background: "rgba(255,255,255,0.15)",
                    borderRadius: "16px",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.25)";
                    e.currentTarget.style.transform = "translateX(10px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                    e.currentTarget.style.transform = "translateX(0)";
                  }}>
                    <div style={{
                      fontSize: "2rem",
                      fontWeight: 800,
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      minWidth: "60px"
                    }}>{step.num}</div>
                    <div>
                      <div style={{ color: "white", fontWeight: 700, fontSize: "1.2rem", marginBottom: "0.3rem" }}>{step.title}</div>
                      <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.95rem" }}>{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 打卡页 */}
        {currentPage === "checkin" && (
          <div className="fade-in" style={{ maxWidth: "600px", margin: "0 auto" }}>
            <div className="glass-card">
              <h2 style={{ color: "white", marginBottom: "2.5rem", fontSize: "2.5rem", textAlign: "center", fontWeight: 800 }}>
                💧 今日节水打卡
              </h2>

              {!account ? (
                <div style={{ textAlign: "center", padding: "3rem" }}>
                  <div style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>🔒</div>
                  <p style={{ color: "white", marginBottom: "2rem", fontSize: "1.1rem" }}>请先连接钱包</p>
                  <button className="btn btn-primary" onClick={connectWallet}>
                    连接钱包
                  </button>
                </div>
              ) : status !== "ready" ? (
                <div style={{ textAlign: "center", padding: "3rem" }}>
                  <div className="spinner"></div>
                  <p style={{ color: "white", marginTop: "1.5rem", fontSize: "1.1rem" }}>正在初始化...</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "2rem" }}>
                  <div>
                    <label style={{ display: "block", color: "white", marginBottom: "0.8rem", fontWeight: 600, fontSize: "1.05rem" }}>
                      节水行为 🌊
                    </label>
                    <select 
                      className="input-field"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      style={{ fontSize: "1.05rem" }}
                    >
                      <option value="1">🚿 关闭水龙头刷牙</option>
                      <option value="2">🧴 淋浴时关水擦肥皂</option>
                      <option value="3">👕 使用节水洗衣机</option>
                      <option value="4">🌧️ 收集雨水浇花</option>
                      <option value="5">♻️ 其他节水行为</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", color: "white", marginBottom: "0.8rem", fontWeight: 600, fontSize: "1.05rem" }}>
                      节水量（升）💧
                    </label>
                    <input 
                      type="number" 
                      className="input-field"
                      placeholder="例如: 3"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min="0"
                      step="0.1"
                      style={{ fontSize: "1.05rem" }}
                    />
                  </div>

                  <button 
                    className="btn btn-primary" 
                    onClick={handleCheckin}
                    disabled={isSubmitting || !amount}
                    style={{ width: "100%", marginTop: "1rem", fontSize: "1.2rem", padding: "1.2rem" }}
                  >
                    {isSubmitting ? "⏳ 上链中..." : "✨ 打卡上链"}
                  </button>

                  {message && (
                    <div style={{
                      padding: "1.2rem",
                      borderRadius: "16px",
                      background: message.includes("✅") 
                        ? "rgba(34, 197, 94, 0.3)" 
                        : message.includes("❌") 
                        ? "rgba(239, 68, 68, 0.3)" 
                        : "rgba(59, 130, 246, 0.3)",
                      color: "white",
                      textAlign: "center",
                      fontSize: "1rem",
                      fontWeight: 500,
                      backdropFilter: "blur(10px)"
                    }}>
                      {message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 我的记录 */}
        {currentPage === "records" && (
          <div className="fade-in">
            <div className="glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
                <h2 style={{ color: "white", fontSize: "2.2rem", fontWeight: 800 }}>📝 我的节水记录</h2>
                <button className="btn btn-primary" style={{ padding: "0.8rem 1.5rem", fontSize: "1rem" }}>
                  📊 导出 CSV
                </button>
              </div>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>节水行为</th>
                      <th>节水量</th>
                      <th>连续天数</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: "3rem" }}>
                          <div className="spinner"></div>
                          <div style={{ marginTop: "1rem", color: "#64748b" }}>加载中...</div>
                        </td>
                      </tr>
                    ) : records.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: "4rem", color: "#64748b" }}>
                          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📭</div>
                          <div style={{ fontSize: "1.1rem" }}>暂无记录，快去打卡吧！</div>
                        </td>
                      </tr>
                    ) : (
                      records.map((record, index) => (
                        <tr key={`${record.timestamp}-${index}`}>
                          <td>{record.date}</td>
                          <td>{record.description}</td>
                          <td>
                            {decryptedMap[record.originalIndex] ? (
                              <span style={{
                                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                color: "white",
                                padding: "0.3rem 0.8rem",
                                borderRadius: "8px",
                                fontSize: "0.9rem",
                                fontWeight: 700
                              }}>
                                💧 {decryptedMap[record.originalIndex]}
                              </span>
                            ) : decryptingIndex === record.originalIndex ? (
                              <span style={{ 
                                background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
                                color: "white",
                                padding: "0.3rem 0.8rem",
                                borderRadius: "8px",
                                fontSize: "0.9rem",
                                fontWeight: 600
                              }}>
                                ⏳ 解密中...
                              </span>
                            ) : (
                              <span style={{ 
                                background: "linear-gradient(135deg, #667eea, #764ba2)",
                                color: "white",
                                padding: "0.3rem 0.8rem",
                                borderRadius: "8px",
                                fontSize: "0.9rem",
                                fontWeight: 600
                              }}>
                                🔒 加密
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{
                              background: record.streak >= 7 ? "#10b981" : "#3b82f6",
                              color: "white",
                              padding: "0.3rem 0.8rem",
                              borderRadius: "8px",
                              fontSize: "0.9rem",
                              fontWeight: 600
                            }}>
                              🔥 {record.streak} 天
                            </span>
                          </td>
                          <td>
                            <button 
                              onClick={async () => {
                                if (decryptingIndex !== null || decryptedMap[record.originalIndex]) return;
                                setDecryptingIndex(record.originalIndex);
                                setMessage("请在钱包中签名以解密...");
                                try {
                                  const res = await decryptAmount(record.originalIndex);
                                  if (res && !res.includes("失败") && !res.includes("需要连接钱包")) {
                                    setDecryptedMap((m) => ({ ...m, [record.originalIndex]: res }));
                                    setMessage(`✅ 解密成功: ${res}`);
                                  } else {
                                    setMessage("❌ 解密失败");
                                  }
                                } catch (e: any) {
                                  setMessage(`❌ 解密失败: ${e?.message || e}`);
                                } finally {
                                  setDecryptingIndex(null);
                                }
                              }}
                              style={{
                                background: "linear-gradient(135deg, #0ea5e9, #06b6d4)",
                                color: "white",
                                border: "none",
                                padding: "0.5rem 1rem",
                                borderRadius: "8px",
                                cursor: "pointer",
                                fontSize: "0.85rem",
                                fontWeight: 600
                              }}
                              disabled={decryptingIndex !== null || Boolean(decryptedMap[record.originalIndex])}
                            >
                              {decryptedMap[record.originalIndex] ? "已解密" : (decryptingIndex === record.originalIndex ? "解密中..." : "🔓 解密")}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 排行榜 */}
        {currentPage === "leaderboard" && (
          <div className="fade-in">
            <div className="glass-card">
              <h2 style={{ color: "white", marginBottom: "2.5rem", fontSize: "2.2rem", fontWeight: 800, textAlign: "center" }}>
                🏆 排行榜
              </h2>

              <div style={{ display: "grid", gap: "1.5rem" }}>
                {topUsers.length === 0 ? (
                  <div style={{ textAlign: "center", color: "rgba(255,255,255,0.8)", padding: "2rem" }}>
                    暂无数据，先去打卡吧！
                  </div>
                ) : (
                  topUsers.slice(0, 10).map((u, idx) => {
                    const styles = [
                      { medal: "🥇", bg: "linear-gradient(135deg, #ffd700, #ffed4e)" },
                      { medal: "🥈", bg: "linear-gradient(135deg, #c0c0c0, #e8e8e8)" },
                      { medal: "🥉", bg: "linear-gradient(135deg, #cd7f32, #e8a87c)" },
                    ];
                    const s = styles[idx] ?? { medal: "🏅", bg: "rgba(255,255,255,0.2)" };
                    const addr = `${u.address.slice(0, 6)}...${u.address.slice(-4)}`;
                    return (
                      <div key={`${u.address}-${idx}`} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1.5rem",
                        padding: "2rem",
                        background: s.bg,
                        borderRadius: "20px",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                        transition: "transform 0.3s ease"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.02)"}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}>
                        <div style={{ fontSize: "3.5rem" }}>{s.medal}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "1.3rem", color: "#1a1a1a" }}>{addr}</div>
                          <div style={{ fontSize: "1rem", opacity: 0.85, marginTop: "0.3rem" }}>
                            🎯 {u.count} 次打卡 · 🏅 {u.badges} 枚徽章
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* NFT 徽章 */}
        {currentPage === "badges" && (
          <div className="fade-in">
            <div className="glass-card">
              <h2 style={{ color: "white", marginBottom: "2.5rem", fontSize: "2.2rem", fontWeight: 800, textAlign: "center" }}>
                🎖️ 我的节水徽章
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem" }}>
                {[
                  { level: 1, name: "节水新手", requirement: badgeThresholdL1 ?? 1, icon: "🌱", color: "#10b981" },
                  { level: 2, name: "环保达人", requirement: 30, icon: "🌿", color: "#06b6d4" },
                  { level: 3, name: "地球守护者", requirement: 100, icon: "🌍", color: "#8b5cf6" },
                ].map((badge) => (
                  <div key={badge.level} style={{
                    padding: "2.5rem",
                    borderRadius: "24px",
                    background: "rgba(255,255,255,0.15)",
                    border: "3px dashed rgba(255,255,255,0.4)",
                    textAlign: "center",
                    transition: "all 0.3s ease"
                  }}>
                    <div style={{ 
                      fontSize: "5rem", 
                      marginBottom: "1.5rem", 
                    }}>
                      {badge.icon}
                    </div>
                    <div style={{ color: "white", fontWeight: 700, fontSize: "1.4rem", marginBottom: "0.8rem" }}>
                      {badge.name}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "1rem", marginBottom: "1.5rem" }}>
                      需要 {badge.requirement} 次打卡
                    </div>
                    {badge.level === 1 ? (
                      <button 
                        className="btn btn-primary" 
                        disabled={!isReady || !resolvedBadgeAddress || badgeMinting}
                        onClick={async () => {
                          if (!isReady || !resolvedBadgeAddress) return;
                          if (badgeMinted) return;
                          setBadgeMinting(true);
                          setMessage("⏳ 正在铸造徽章...");
                          try {
                            const c = new ethers.Contract(resolvedBadgeAddress, ["function mintBadge(uint8 level) returns(uint256)", "function minted(address,uint8) view returns(bool)"], signer!);
                            const tx = await c.mintBadge(1);
                            await tx.wait();
                            setMessage("✅ 成功铸造“节水新手”徽章！");
                            const user = await signer!.getAddress();
                            const minted = await c.minted(user, 1);
                            setBadgeMinted(Boolean(minted));
                          } catch (e: any) {
                            setMessage(`❌ 铸造失败: ${e?.message || e}`);
                          } finally {
                            setBadgeMinting(false);
                          }
                        }}
                        style={{ 
                          width: "100%", 
                          fontSize: "1rem",
                          background: badgeMinted ? "linear-gradient(135deg, #22c55e, #16a34a)" : undefined,
                          boxShadow: badgeMinted ? "0 8px 20px rgba(34,197,94,0.35)" : undefined,
                          border: badgeMinted ? "2px solid rgba(34,197,94,0.6)" : undefined,
                          cursor: badgeMinted ? "default" : undefined
                        }}
                      >
                        {badgeMinted ? "✅ 已解锁" : badgeMinting ? "铸造中..." : "✨ 立即解锁"}
                      </button>
                    ) : (
                      <button className="btn btn-primary" disabled style={{ width: "100%", fontSize: "1rem", opacity: 0.5 }}>
                        🔒 未解锁
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

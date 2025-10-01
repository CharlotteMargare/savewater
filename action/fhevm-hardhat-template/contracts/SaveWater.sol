// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, euint64, euint256, ebool, externalEuint32, externalEuint64, externalEuint256 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * SaveWater
 * - 使用 FHEVM 存储与运算打卡数据：
 *   - 金额（节水估计量）使用加密整数类型存储（euint64）
 *   - 记录描述采用明文枚举 id（前端可映射为文本）；若需强隐私，可扩展为密文句柄
 * - 记录事件与排行榜统计在链上完成
 * - 兼容外部输入（externalEuint* + proof）来自前端 encrypt 的句柄
 */
contract SaveWater is SepoliaConfig {
    struct Record {
        uint256 timestamp;       // 打卡时间戳（秒）
        uint32 descriptionId;    // 描述枚举 id（前端渲染映射）
        euint64 amount;          // 加密节水量（例如 升）
        uint32 streak;           // 连续打卡天数（明文，便于排序与查询）
    }

    event WaterSaved(address indexed user, uint256 timestamp, uint256 amountClearOptional);

    // 用户 => 记录数组
    mapping(address => Record[]) private _recordsByUser;
    // 用户 => 总次数
    mapping(address => uint32) private _userCounts;
    // 用户 => 加密累计节水量（同态累加）
    mapping(address => euint64) private _userEncryptedTotal;
    // 全局总次数
    uint256 private _totalSaves;
    // 用户 => 最近打卡日（UTC 日粒度）
    mapping(address => uint32) private _lastDay;
    // 用户 => 当前连续天数
    mapping(address => uint32) private _streak;

    // 顶部用户缓存（小规模 O(n) 维护，演示用；生产可分页或 offchain 统计）
    address[] private _users; // 去重登记
    mapping(address => bool) private _userSeen;

    ////////////////////////////////////////////////////////////////////////////////
    // 写操作
    ////////////////////////////////////////////////////////////////////////////////

    /**
     * 记录一次节水（前端需先 encrypt 金额，传入 external 句柄与 proof）
     * - descriptionId: 前端定义的枚举 id
     * - encryptedAmount: external 加密金额句柄（64 位）
     * - proof: 加密输入证明
     * - revealAmount: 可选是否在事件中公开明文金额（开发/演示友好）
     */
    function recordSave(
        uint32 descriptionId,
        externalEuint64 encryptedAmount,
        bytes calldata proof,
        bool revealAmount
    ) external {
        // 将 external 句柄转换为内部加密类型
        euint64 amount = FHE.fromExternal(encryptedAmount, proof);

        // 允许本合约地址对该句柄进行解密（Relayer 需要 dapp 合约授权）
        FHE.allowThis(amount);

        // 连续天数计算（UTC 日）
        uint32 dayId = uint32(block.timestamp / 1 days);
        uint32 currentStreak = _streak[msg.sender];
        uint32 lastDay = _lastDay[msg.sender];
        if (lastDay == 0) {
            currentStreak = 1;
        } else if (dayId == lastDay) {
            // 同一天多次：不增长 streak，但允许多条记录
        } else if (dayId == lastDay + 1) {
            unchecked { currentStreak += 1; }
        } else {
            currentStreak = 1;
        }
        _lastDay[msg.sender] = dayId;
        _streak[msg.sender] = currentStreak;

        // 记录存储
        _recordsByUser[msg.sender].push(
            Record({
                timestamp: block.timestamp,
                descriptionId: descriptionId,
                amount: amount,
                streak: currentStreak
            })
        );

        // 默认为记录创建者授予该条记录的解密权限（便于前端 userDecrypt）
        FHE.allow(amount, msg.sender);

        // 同态累计用户总节水量
        // _userEncryptedTotal[msg.sender] = FHE.add(_userEncryptedTotal[msg.sender], amount);
        // 如果首次未初始化，直接加也可；FHE.add(0, x) == x
        _userEncryptedTotal[msg.sender] = FHE.add(_userEncryptedTotal[msg.sender], amount);
        // 确保累计总量句柄同样对合约与本人授权（便于后续解密/比较）
        FHE.allowThis(_userEncryptedTotal[msg.sender]);
        FHE.allow(_userEncryptedTotal[msg.sender], msg.sender);

        // 统计
        unchecked {
            _totalSaves += 1;
            _userCounts[msg.sender] += 1;
        }

        if (!_userSeen[msg.sender]) {
            _userSeen[msg.sender] = true;
            _users.push(msg.sender);
        }

        // 提示：链上不执行解密；revealAmount 仅用于未来扩展
        emit WaterSaved(msg.sender, block.timestamp, 0);
    }

    // ACL 授权：将某条记录的加密金额授权给 grantee 解密
    function grantAccessForRecord(uint256 index, address grantee) external {
        require(index < _recordsByUser[msg.sender].length, "bad index");
        Record storage r = _recordsByUser[msg.sender][index];
        // 为历史记录补充授权：
        // - 授权合约地址（Relayer 需要）
        // - 授权指定 grantee 地址
        FHE.allowThis(r.amount);
        FHE.allow(r.amount, grantee);
    }

    // ACL 授权：将用户累计加密总量授权给 grantee 解密
    function grantAccessForTotal(address grantee) external {
        // 为累计总量补充授权给合约与 grantee
        FHE.allowThis(_userEncryptedTotal[msg.sender]);
        FHE.allow(_userEncryptedTotal[msg.sender], grantee);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // 读操作
    ////////////////////////////////////////////////////////////////////////////////

    function getTotalSaves() external view returns (uint256) {
        return _totalSaves;
    }

    function getUserCount(address user) external view returns (uint32) {
        return _userCounts[user];
    }

    function getUserStreak(address user) external view returns (uint32) {
        return _streak[user];
    }

    function getUserRecordsLength(address user) external view returns (uint256) {
        return _recordsByUser[user].length;
    }

    // 直接返回 euint64（ABI 将以句柄 bytes32 表示），前端使用 userDecrypt 解密
    function getUserRecord(address user, uint256 index)
        external
        view
        returns (uint256 timestamp, uint32 descriptionId, euint64 amount, uint32 streak)
    {
        Record storage r = _recordsByUser[user][index];
        return (r.timestamp, r.descriptionId, r.amount, r.streak);
    }

    // 返回用户累计加密总量（可授权解密）
    function getUserTotalAmount(address user) external view returns (euint64) {
        return _userEncryptedTotal[user];
    }

    // 比较累计总量是否达到阈值（返回 ebool 句柄，前端可解密 true/false）
    function hasReachedAmountThreshold(address user, uint64 threshold)
        external
        returns (ebool)
    {
        // 注意：部分 FHE 辅助函数在编译期不标记 view，这里不加 view 修饰
        return FHE.ge(_userEncryptedTotal[user], FHE.asEuint64(threshold));
    }

    // 链上不提供解密，保持最小泄露面

    // 前十名用户（按打卡次数）
    function getTopUsers() external view returns (address[] memory topUsers, uint32[] memory counts) {
        uint256 n = _users.length;
        if (n == 0) {
            return (new address[](0), new uint32[](0));
        }
        // 复制到内存数组排序（小规模演示用）
        address[] memory addrs = new address[](n);
        uint32[] memory cs = new uint32[](n);
        for (uint256 i = 0; i < n; i++) {
            address u = _users[i];
            addrs[i] = u;
            cs[i] = _userCounts[u];
        }
        // 选择排序取前十
        uint256 limit = n < 10 ? n : 10;
        for (uint256 i = 0; i < limit; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < n; j++) {
                if (cs[j] > cs[maxIdx]) maxIdx = j;
            }
            if (maxIdx != i) {
                (cs[i], cs[maxIdx]) = (cs[maxIdx], cs[i]);
                (addrs[i], addrs[maxIdx]) = (addrs[maxIdx], addrs[i]);
            }
        }
        // 截断
        address[] memory outAddrs = new address[](limit);
        uint32[] memory outCounts = new uint32[](limit);
        for (uint256 i = 0; i < limit; i++) {
            outAddrs[i] = addrs[i];
            outCounts[i] = cs[i];
        }
        return (outAddrs, outCounts);
    }
}



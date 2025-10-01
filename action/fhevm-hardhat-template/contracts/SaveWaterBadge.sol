// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

interface ISaveWater {
    function getUserCount(address user) external view returns (uint32);
}

/**
 * SaveWaterBadge
 * - 达到阈值即可铸造对应等级 NFT：7 / 30 / 100
 * - tokenURI 由 level → baseURI 映射，前端展示为 IPFS 资源
 */
contract SaveWaterBadge is ERC721, Ownable {
    ISaveWater public immutable saveWater;

    mapping(uint8 => uint32) public thresholds; // level => min count
    mapping(uint8 => string) public levelBaseURI; // level => baseURI

    // user => level => minted
    mapping(address => mapping(uint8 => bool)) public minted;

    uint256 private _tokenIdSeq;

    event BadgeMinted(address indexed user, uint8 level, uint256 tokenId);

    constructor(address saveWaterAddress) ERC721("SaveWater Badge", "SWB") Ownable(msg.sender) {
        require(saveWaterAddress != address(0), "invalid SaveWater");
        saveWater = ISaveWater(saveWaterAddress);
        thresholds[1] = 7;
        thresholds[2] = 30;
        thresholds[3] = 100;
    }

    function setThreshold(uint8 level, uint32 value) external onlyOwner {
        require(level >= 1 && level <= 3, "bad level");
        thresholds[level] = value;
    }

    function setLevelBaseURI(uint8 level, string calldata uri) external onlyOwner {
        require(level >= 1 && level <= 3, "bad level");
        levelBaseURI[level] = uri;
    }

    function mintBadge(uint8 level) external returns (uint256 tokenId) {
        require(level >= 1 && level <= 3, "bad level");
        require(!minted[msg.sender][level], "already minted");
        uint32 count = saveWater.getUserCount(msg.sender);
        require(count >= thresholds[level], "not enough count");

        tokenId = ++_tokenIdSeq;
        minted[msg.sender][level] = true;
        _safeMint(msg.sender, tokenId);
        emit BadgeMinted(msg.sender, level, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        // 简化：根据持有人已铸等级推断 URI（演示用途）
        address owner = _ownerOf(tokenId);
        for (uint8 l = 1; l <= 3; l++) {
            if (minted[owner][l]) {
                string memory base = levelBaseURI[l];
                if (bytes(base).length > 0) return string(abi.encodePacked(base, Strings.toString(tokenId)));
            }
        }
        return "";
    }
}



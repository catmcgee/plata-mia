// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title StealthVault
/// @notice Minimal MVP vault that buckets ERC20 balances per (stealthId, assetId).
/// @dev Withdraw authorization is intentionally missing for now; this will be
///      replaced with a proper stealth key or signature flow in later versions.
contract StealthVault {
    IERC20 public immutable token;

    mapping(bytes32 stealthId => mapping(bytes32 assetId => uint256 amount)) public balances;

    event StealthPayment(
        bytes32 indexed stealthId,
        bytes32 indexed assetId,
        uint256 amount,
        bytes32 indexed receiverTag
    );

    constructor(IERC20 _token) {
        token = _token;
    }

    function depositStealth(
        bytes32 stealthId,
        bytes32 assetId,
        uint256 amount,
        bytes32 receiverTag
    ) external {
        require(amount > 0, "amount=0");
        require(assetId != bytes32(0), "assetId=0");

        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "transferFrom failed");

        balances[stealthId][assetId] += amount;

        emit StealthPayment(stealthId, assetId, amount, receiverTag);
    }

    function withdraw(bytes32 stealthId, bytes32 assetId, address to, uint256 amount) external {
        require(to != address(0), "zero address");
        require(amount > 0, "amount=0");

        uint256 bal = balances[stealthId][assetId];
        require(bal >= amount, "insufficient");

        balances[stealthId][assetId] = bal - amount;

        bool ok = token.transfer(to, amount);
        require(ok, "transfer failed");
        // TODO: once stealth auth is ready, only approved recipients should be able to call withdraw.
    }
}


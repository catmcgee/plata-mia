// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestToken
/// @notice Lightweight ERC20 for exercising the StealthVault flows on local Hardhat.
contract TestToken is ERC20 {
    constructor() ERC20("Test Token", "TST") {
        _mint(msg.sender, 1_000_000 ether);
    }
}


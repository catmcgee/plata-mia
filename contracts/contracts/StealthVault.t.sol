// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StealthVault} from "./StealthVault.sol";
import {TestToken} from "./TestToken.sol";

contract StealthVaultTest is Test {
    StealthVault internal vault;
    TestToken internal token;

    address internal depositor = address(0xBEEF);
    address internal receiver = address(0xCAFE);

    bytes32 internal constant STEALTH_ID = keccak256("stealth-bucket");
    bytes32 internal constant ASSET_ID = keccak256("TST");
    bytes32 internal constant RECEIVER_TAG = keccak256("receiver-tag");

    function setUp() public {
        token = new TestToken();
        vault = new StealthVault(token);

        // Seed the depositor with liquidity for local Hardhat tests.
        token.transfer(depositor, 500_000 ether);
    }

    function test_DepositStealthStoresBalance() public {
        uint256 amount = 123 ether;

        vm.startPrank(depositor);
        token.approve(address(vault), amount);

        vm.expectEmit(true, true, true, true, address(vault));
        emit StealthVault.StealthPayment(STEALTH_ID, ASSET_ID, amount, RECEIVER_TAG);

        vault.depositStealth(STEALTH_ID, ASSET_ID, amount, RECEIVER_TAG);
        vm.stopPrank();

        assertEq(vault.balances(STEALTH_ID, ASSET_ID), amount);
        assertEq(token.balanceOf(address(vault)), amount);
    }

    function test_WithdrawMovesFundsAndClearsBalance() public {
        uint256 amount = 42 ether;
        _deposit(amount);

        uint256 receiverBalanceBefore = token.balanceOf(receiver);

        // Withdraw is intentionally permissionless for this MVP; any caller can pull the funds.
        vm.prank(receiver);
        vault.withdraw(STEALTH_ID, ASSET_ID, receiver, amount);

        assertEq(vault.balances(STEALTH_ID, ASSET_ID), 0);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(token.balanceOf(receiver) - receiverBalanceBefore, amount);
    }

    function _deposit(uint256 amount) internal {
        vm.startPrank(depositor);
        token.approve(address(vault), amount);
        vault.depositStealth(STEALTH_ID, ASSET_ID, amount, RECEIVER_TAG);
        vm.stopPrank();
    }
}


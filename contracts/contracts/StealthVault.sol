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

    /**
     * Invoices are designed to be consumed from other chains via Hyperbridge.
     *
     * Polkadot-SDK chains can integrate with Hyperbridge using the Pallet ISMP,
     * Pallet Hyperbridge & Pallet Token Gateway described in:
     *
     *   https://docs.hyperbridge.network/developers/polkadot/getting-started
     *   https://docs.hyperbridge.network/developers/evm/getting-started
     *
     * This contract lives on an EVM chain (e.g. Passet Hub) and can be queried
     * via Hyperbridge storage proofs from Polkadot-SDK or other chains.
     */
    struct Invoice {
        address merchant;
        bytes32 assetId;
        uint256 amount;
        bool paid;
    }

    mapping(bytes32 invoiceId => Invoice invoice) public invoices;

    event StealthPayment(
        bytes32 indexed stealthId,
        bytes32 indexed assetId,
        uint256 amount,
        bytes32 indexed receiverTag
    );

    event InvoiceCreated(
        bytes32 indexed invoiceId,
        address indexed merchant,
        bytes32 indexed assetId,
        uint256 amount
    );

    event InvoicePaid(
        bytes32 indexed invoiceId,
        bytes32 indexed stealthId,
        bytes32 indexed assetId,
        uint256 amount,
        address merchant
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

    function createInvoice(bytes32 invoiceId, address merchant, bytes32 assetId, uint256 amount) external {
        require(merchant != address(0), "merchant=0");
        require(amount > 0, "amount=0");

        Invoice storage inv = invoices[invoiceId];
        require(inv.merchant == address(0), "invoice exists");

        inv.merchant = merchant;
        inv.assetId = assetId;
        inv.amount = amount;
        inv.paid = false;

        emit InvoiceCreated(invoiceId, merchant, assetId, amount);
    }

    function payInvoice(bytes32 stealthId, bytes32 assetId, bytes32 invoiceId) external {
        Invoice storage inv = invoices[invoiceId];
        require(inv.merchant != address(0), "invoice missing");
        require(!inv.paid, "already paid");
        require(inv.assetId == assetId, "asset mismatch");

        uint256 amount = inv.amount;
        uint256 bal = balances[stealthId][assetId];
        require(bal >= amount, "insufficient stealth");

        balances[stealthId][assetId] = bal - amount;

        bool ok = token.transfer(inv.merchant, amount);
        require(ok, "transfer failed");

        inv.paid = true;

        emit InvoicePaid(invoiceId, stealthId, assetId, amount, inv.merchant);
    }
}


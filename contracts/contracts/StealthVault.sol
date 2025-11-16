// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title StealthVault
/// @notice Minimal MVP vault that buckets ERC20 and native token balances per (stealthId, assetId).
/// @dev Withdraw authorization is intentionally missing for now; this will be
///      replaced with a proper stealth key or signature flow in later versions.
contract StealthVault {
    IERC20 public immutable token;

    mapping(bytes32 stealthId => mapping(bytes32 assetId => uint256 amount))
        public balances;

    /// @notice Special constant to identify native token (ETH/PAS) deposits
    bytes32 public constant NATIVE_ASSET_ID = keccak256("PAS");

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
        require(
            assetId != NATIVE_ASSET_ID,
            "use depositStealthNative for native token"
        );

        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "transferFrom failed");

        balances[stealthId][assetId] += amount;

        emit StealthPayment(stealthId, assetId, amount, receiverTag);
    }

    /// @notice Deposit native token (ETH/PAS) to a stealth address
    function depositStealthNative(
        bytes32 stealthId,
        bytes32 receiverTag
    ) external payable {
        require(msg.value > 0, "amount=0");

        balances[stealthId][NATIVE_ASSET_ID] += msg.value;

        emit StealthPayment(stealthId, NATIVE_ASSET_ID, msg.value, receiverTag);
    }

    function withdraw(
        bytes32 stealthId,
        bytes32 assetId,
        address to,
        uint256 amount
    ) external {
        require(to != address(0), "zero address");
        require(amount > 0, "amount=0");

        uint256 bal = balances[stealthId][assetId];
        require(bal >= amount, "insufficient");

        balances[stealthId][assetId] = bal - amount;

        if (assetId == NATIVE_ASSET_ID) {
            // Withdraw native token
            (bool success, ) = payable(to).call{value: amount}("");
            require(success, "native transfer failed");
        } else {
            // Withdraw ERC20 token
            bool ok = token.transfer(to, amount);
            require(ok, "transfer failed");
        }
        // TODO: once stealth auth is ready, only approved recipients should be able to call withdraw.
    }

    function createInvoice(
        bytes32 invoiceId,
        address merchant,
        bytes32 assetId,
        uint256 amount
    ) external {
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

    function payInvoice(
        bytes32 stealthId,
        bytes32 assetId,
        bytes32 invoiceId
    ) external {
        Invoice storage inv = invoices[invoiceId];
        require(inv.merchant != address(0), "invoice missing");
        require(!inv.paid, "already paid");
        require(inv.assetId == assetId, "asset mismatch");

        uint256 amount = inv.amount;
        uint256 bal = balances[stealthId][assetId];
        require(bal >= amount, "insufficient stealth");

        balances[stealthId][assetId] = bal - amount;

        if (assetId == NATIVE_ASSET_ID) {
            // Pay invoice with native token
            (bool success, ) = payable(inv.merchant).call{value: amount}("");
            require(success, "native transfer failed");
        } else {
            // Pay invoice with ERC20 token
            bool ok = token.transfer(inv.merchant, amount);
            require(ok, "transfer failed");
        }

        inv.paid = true;

        emit InvoicePaid(invoiceId, stealthId, assetId, amount, inv.merchant);
    }

    /// @notice Pay invoice from multiple stealth addresses (for aggregated balance)
    /// @dev This allows paying from multiple UTXOs when a single stealth address has insufficient balance
    function payInvoiceMulti(
        bytes32[] calldata stealthIds,
        bytes32 assetId,
        bytes32 invoiceId
    ) external {
        Invoice storage inv = invoices[invoiceId];
        require(inv.merchant != address(0), "invoice missing");
        require(!inv.paid, "already paid");
        require(inv.assetId == assetId, "asset mismatch");
        require(stealthIds.length > 0, "no stealth IDs");

        uint256 totalAmount = inv.amount;
        uint256 collected = 0;

        // Collect funds from multiple stealth addresses
        for (uint256 i = 0; i < stealthIds.length; i++) {
            bytes32 stealthId = stealthIds[i];
            uint256 bal = balances[stealthId][assetId];

            if (bal == 0) continue;

            uint256 toTake = totalAmount - collected;
            if (bal < toTake) {
                toTake = bal;
            }

            balances[stealthId][assetId] = bal - toTake;
            collected += toTake;

            if (collected >= totalAmount) break;
        }

        require(collected >= totalAmount, "insufficient stealth balance");

        // Transfer to merchant
        if (assetId == NATIVE_ASSET_ID) {
            (bool success, ) = payable(inv.merchant).call{value: totalAmount}("");
            require(success, "native transfer failed");
        } else {
            bool ok = token.transfer(inv.merchant, totalAmount);
            require(ok, "transfer failed");
        }

        inv.paid = true;

        // Emit event with first stealthId for tracking
        emit InvoicePaid(invoiceId, stealthIds[0], assetId, totalAmount, inv.merchant);
    }
}

# Plata Mia

**Privacy-Preserving Cross-Chain Payments**

Plata Mia enables private, unlinkable payments using stealth addresses with cross-chain balance verification through Hyperbridge and notifications with XX Network.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [How It Works](#how-it-works)
- [Protocol Integration](#protocol-integration)
- [Quick Start](#quick-start)
- [Privacy Model](#privacy-model)

---

## Overview

Plata Mia solves the privacy problem in blockchain payments by implementing:

1. **Stealth Addresses**: Receive payments to unlinkable addresses
2. **UTXO Model**: Each payment is a separate unspent transaction output. This is how most privacy blockchains work
3. **Aggregated Payments**: Pay from multiple UTXOs in a single transaction
4. **Cross-Chain Verification**: Verify balances across chains without bridging tokens
5. **Private Notifications**: Metadata-resistant messaging - get the info to withdraw or spend your stealth balances in a private quantum-resistant XX inbox

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         PLATA MIA SYSTEM                         │
└──────────────────────────────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
   ┌────▼────┐              ┌─────▼──────┐          ┌──────▼──────┐
   │Frontend │              │  Indexer   │          │ XX Proxy    │
   │(Next.js)│              │(Fastify)   │          │ (Go/xxDK)   │
   └────┬────┘              └─────┬──────┘          └──────┬──────┘
        │                         │                         │
        └────────────┬────────────┴─────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │    Smart Contracts      │
        │   (StealthVault.sol)    │
        │  Passet Hub Testnet     │
        │    │
        └────────────┬────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼─────┐ ┌───▼────┐ ┌─────▼────┐
   │Hyperbridge│ │XX Network│ │Polkadot  │
   │   SDK    │ │  cMix   │ │Asset Hub │
   └──────────┘ └─────────┘ └──────────┘
```

### Component Responsibilities

| Component        | Purpose                                             | Technology                    |
| ---------------- | --------------------------------------------------- | ----------------------------- |
| **Frontend**     | User interface for sending/receiving payments       | Next.js 16, React 19, wagmi   |
| **StealthVault** | Smart contract managing stealth balances & invoices | Solidity 0.8.24, Hardhat      |
| **Indexer**      | Hyperbridge storage proof provider                  | Fastify, @hyperbridge/sdk     |
| **XX Proxy**     | Private messaging gateway                           | Go, gitlab.com/elixxir/client |

---

## How It Works

### Payment Flow

```
┌─────────┐                                           ┌─────────┐
│  Sender │                                           │Recipient│
│  (Bob)  │                                           │ (Alice) │
└────┬────┘                                           └────┬────┘
     │                                                      │
     │ 1. Enter "alice-test" + 0.1 PAS                    │
     │                                                      │
     ├─► 2. Generate stealthId = hash("alice-test:timestamp:random")
     │          receiverTag = hash("alice-test")           │
     │                                                      │
     │ 3. depositStealthNative(stealthId, receiverTag)     │
     ├──────────────────────────────────────────────────┐  │
     │                                                   │  │
     │                StealthVault.sol                   │  │
     │         balances[stealthId][PAS] = 0.1           │  │
     │         emit StealthPayment(...)                 │  │
     │                                                   │  │
     │◄──────────────────────────────────────────────────┘  │
     │                                                      │
     │                                                      │ 4. Scan events
     │                                                      │    for receiverTag
     │                                                      ◄───
     │                                                      │
     │                                                      │ 5. Discover payment
     │                                                      │    stealthId: 0.1 PAS
     │                                                      │
```

### Invoice Payment Flow (Multi-UTXO)

```
┌──────────┐                                         ┌──────────┐
│ Customer │                                         │ Merchant │
└────┬─────┘                                         └────┬─────┘
     │                                                     │
     │ 1. Browse items (0.5 PAS total)                   │
     │                                                     │
     │◄────────────── 2. createInvoice() ─────────────────┤
     │                  invoiceId: 0xABC                  │
     │                                                     │
     │ 3. Hyperbridge: Check aggregated stealth balance   │
     ├─────────────────────────────────────────────────┐  │
     │  Storage proofs for all stealthIds:             │  │
     │  - stealthId1[PAS] = 0.1                        │  │
     │  - stealthId2[PAS] = 0.2                        │  │
     │  - stealthId3[PAS] = 0.15                       │  │
     │  - stealthId4[PAS] = 0.3                        │  │
     │  Total: 0.75 >= 0.5 ✓                           │  │
     │◄────────────────────────────────────────────────┘  │
     │                                                     │
     │ 4. payInvoiceMulti([id1, id2, id3], assetId, invoiceId)
     ├──────────────────────────────────────────────────┐ │
     │  Contract:                                       │ │
     │  - Withdraw 0.1 from id1                        │ │
     │  - Withdraw 0.2 from id2                        │ │
     │  - Withdraw 0.15 from id3                       │ │
     │  - Transfer 0.45 to merchant... need 0.05 more  │ │
     │  - Withdraw 0.3 from id4                        │ │
     │  - Transfer additional 0.05 (total: 0.5)        │ │
     │  - Refund 0.25 to id4                           │ │
     │  - Set invoices[0xABC].paid = true              │ │
     │◄─────────────────────────────────────────────────┘ │
     │                                                     │
     │                                                     │ 5. Hyperbridge verify
     │                                                     ├──────────────┐
     │                                                     │ Read storage:│
     │                                                     │ paid = true ✓│
     │                                                     ◄──────────────┘
```

### Stealth Address Generation

```
User Public ID: "alice-test"
           │
           ├─► receiverTag = keccak256("alice-test")
           │   Purpose: Discovery (constant per user)
           │   Example: 0x7a9b3c... (same for all Alice's payments)
           │
           └─► Per-Payment Generation:
               ├─ timestamp = 1234567890
               ├─ random = 0xDEADBEEF
               └─ stealthId = keccak256("alice-test:1234567890:0xDEADBEEF")
                  Purpose: Unlinkable storage (unique per payment)
                  Example: 0x1f3a8e... (different every time)

Onchain Storage:
┌──────────────────────────────────────────┐
│ balances[0x1f3a8e...][PAS] = 0.1        │ ← Unlinkable
│ balances[0x9c2d4f...][PAS] = 0.2        │ ← Unlinkable
│ balances[0x5b7e1a...][PAS] = 0.15       │ ← Unlinkable
└──────────────────────────────────────────┘
         │
         └─► Discovery: Scan events for receiverTag = 0x7a9b3c...
```

---

## Protocol Integration

### Hyperbridge: Crosschain state verification & payments from stealth balance on any chain

**Why we need it**: To verify stealth balances and invoice payments across chains without bridging tokens or trusting third parties

**What it does**: Provides proofs of storage state on other chains

#### How Hyperbridge Works in Plata Mia

1. **Storage Slot Computation**

Solidity nested mappings require calculating storage slots:

```typescript
const BALANCES_BASE_SLOT = 0n;

const outerSlot = keccak256(
  encodeAbiParameters(["bytes32", "uint256"], [stealthId, BALANCES_BASE_SLOT])
);

const finalSlot = keccak256(
  encodeAbiParameters(["bytes32", "uint256"], [assetId, hexToBigInt(outerSlot)])
);

const balance = await client.getStorageAt({
  address: stealthVaultAddress,
  slot: finalSlot,
});
```

2. **Aggregated Balance Verification**

Without Hyperbridge, you'd need to:

- Bridge tokens to the merchant's chain, OR
- Trust a centralized oracle

With Hyperbridge:

```typescript
// Merchant on Chain B checks customer's stealth balance on Chain A (Passet Hub)
const utxos = await discoverStealthUTXOs(publicId);
const totalBalance = await queryAggregatedStealthCreditViaHyperbridge({
  stealthIds: utxos,
  assetId: PAS_TOKEN,
  requiredAmount: invoiceAmount,
});

// Hyperbridge returns: { sufficient: true, total: 0.75 }
// Uses storage proofs
```

3. **Invoice Status Verification**

```solidity
struct Invoice {
    address merchant;  // slot offset 0
    bytes32 assetId;   // slot offset 1
    uint256 amount;    // slot offset 2
    bool paid;         // slot offset 3  ← We verify this
}
```

```typescript
const INVOICES_BASE_SLOT = 1n;
const structSlot = keccak256(
  encodeAbiParameters(["bytes32", "uint256"], [invoiceId, INVOICES_BASE_SLOT])
);
const paidSlot = structSlot + 3n; // Access 'paid' field

const isPaid = await client.getStorageAt({
  address: stealthVaultAddress,
  slot: paidSlot,
});
// Hyperbridge verifies this storage value via consensus
```

See [docs/HYPERBRIDGE_INTEGRATION.md](docs/HYPERBRIDGE_INTEGRATION.md) for detailed implementation.

---

### XX Network: Quantum-resistent messaging

**Why we need it**: To notify users of incoming stealth payments without revealing sender/receiver identity to network observers

Existing privacy solutions either require the user to try to decrypt all messages onchain, or apply some sort of tag mechanism that decreases privacy. With XX network we can send untraceable messages with the data available to allow the user to spend or withdraw their stealth balances.

**What it does**: Routes messages through a quantum-resistant mixnet with end-to-end encryption

#### Key Privacy Features

**No Tagging Scheme = Maximum Privacy**

Unlike traditional messaging systems that use topics/tags for routing, XX Network uses **computational discrimination**:

```
Traditional Systems:
  Topic: "alice-payments" ← Metadata leak

XX Network:
  No tags → Recipients try to decrypt all messages → Only valid recipient succeeds
```

**How it provides privacy**:

- All messages encrypted with recipient's public key
- Recipients attempt to decrypt passing messages
- Only valid recipient can decrypt
- **No metadata**: network can't determine sender/receiver
- **Quantum-resistant**: LFG

This eliminates metadata leakage that would compromise stealth address privacy.

---

## Run the app

### Prerequisites

- Node.js 20+
- Go 1.21+ (for XX Network proxy)
- Wallet with PAS tokens on [Passet Hub Testnet](https://polkadot.js.org/apps/?rpc=wss://paseo-asset-hub-rpc.polkadot.io#/explorer)
- Wallet (I've only tested this with MetaMask)

### 1. Clone Repository

```bash
git clone https://github.com/your-org/plata-mia.git
cd plata-mia
```

### 2. Deploy Smart Contract (or use contract on testnet)

```bash
cd contracts
npm install
npx hardhat test

# Deploy to Passet Hub Testnet
npx hardhat ignition deploy --network passetHubTestnet ignition/modules/StealthVault.ts

# Or use this: 0xe4F461EaECD4DeFF700e31f7Fb74bb4395089020
```

### 3. Start XX Network Proxy

```bash
cd xxproxy
go mod download

# Start proxy on port 8787
XX_PROXY_LISTEN=:8787 go run main.go

```

Expected output:

```
2025/01/15 10:30:45 Starting XX Network proxy on :8787
2025/01/15 10:30:45 Downloading NDF...
2025/01/15 10:31:02 Creating new client state...
2025/01/15 10:33:15 Network follower healthy
2025/01/15 10:33:15 DM client initialized
2025/01/15 10:33:15 XX Network proxy ready!
```

### 4. Start Hyperbridge Indexer

```bash
cd indexers/paseo-hyperbridge
npm install

# Configure environment
cat > .env <<EOF
STEALTH_VAULT_ADDRESS_PASSET=0xe4F461EaECD4DeFF700e31f7Fb74bb4395089020
PASSET_RPC_URL=https://paseo-asset-hub-rpc.polkadot.io
HYPERBRIDGE_RPC_URL=https://hyperbridge.polkadot.io
EOF

# Start indexer
npm run dev

# Listens on http://localhost:4545
```

### 5. Start Frontend

```bash
cd app
npm install

# Configure environment
cat > .env.local <<EOF
NEXT_PUBLIC_STEALTH_VAULT_ADDRESS_PASSET=0xe4F461EaECD4DeFF700e31f7Fb74bb4395089020
NEXT_PUBLIC_PASSET_CHAIN_ID=420420422
HYPERBRIDGE_INDEXER_URL=http://localhost:4545
XX_PROXY_BASE_URL=http://localhost:8787
EOF

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 6. Get Testnet Tokens

1. Visit [Polkadot Faucet](https://faucet.polkadot.io/)
2. Select "Paseo Asset Hub"
3. Enter your wallet address
4. Receive PAS tokens

### 7. Follow instructions on the app

The app tells you what to do and explains what's going on. Just follow!

---

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT License - see [LICENSE](LICENSE) file

---

## Links

- **Documentation**: [docs/](docs/)
- **Hyperbridge SDK**: https://docs.hyperbridge.network/
- **XX Network**: https://xx.network/
- **Polkadot**: https://polkadot.network/

---

**Built with ❤️ for the Polkadot ecosystem**

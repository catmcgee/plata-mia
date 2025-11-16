# **MILESTONE 2 PLAN: Plata Mia**

**Team:** Cat McGee
**Track:** SHIP-A-TON
**Date:** November 16, 2025

---

## 📍 **WHERE WE ARE NOW**

**What we built/validated this weekend:**

- A working stealth-address system on Psset Hub using stealth wallets
- Cross-chain querying of stealth balances using the Hyperbridge SDK
- A fully functional Next.js UI demonstrating:

  - Stealth deposits
  - Stealth invoice creation
  - Invoice payment from stealth
  - Hyperbridge-based invoice verification

- A working xx-network backend (Go-based) capable of sending live private notifications
- A browser xxDK-WASM inbox integrated directly in the UI

**What's working:**

- Stealth payments using native PAS on Passet Hub
- Hyperbridge storage reads for cross-chain invoice status + stealth balances
- xxDK client in-browser: receiving messages reliably via cMix mixnet
- Notification flow: Stealth payment → Go backend → xx network → inbox panel

**What still needs work:**

- Wallet integration! Currently only dapp UI supports stealth flows.
- Notification routing to wallet inboxes (xx → wallet bridge not built yet)
- Multi-asset + cross-chain payoff flows (XCM pay-with-stealth UI)
- Using EVM stealth address cryptography rather than keccak
- A demo deployment

**Blockers or hurdles we hit:**

- Wallet integration requires SDK engineering + collaboration with ecosystem teams
- Could not finish cryptography inplementation inside hackathon

---

## 🚀 **WHAT WE'LL SHIP IN 30 DAYS**

**Our MVP will do this:**
Plata Mia will let any Polkadot or Kusama user send and receive stealth payments **directly inside their wallet**, with private notifications delivered through the **xx network** instead of on-chain tags. Users will be able to pay across chains using stealth balances via **Hyperbridge**, without ever needing to visit our app.

---

## **Features We'll Build (focused on getting into wallets)**

---

### **Week 1–2**

#### **Feature:** Wallet Connector + Stealth Identity Module

**Why it matters:**
Users should be able to activate “Stealth Mode” from within their Polkadot wallet (Talisman/Subwallet). This module will derive & store stealth keys, manage `stealthId`, and sync with the vault contract.
**Who builds it:** Cat McGee

#### **Feature:** Wallet Stealth Balance Panel

**Why it matters:**
Wallet → Assets tab → “Stealth Balance” auto-shows available PAS funds retrieved through Hyperbridge
**Who builds it:** Frontend Engineer (friend)

---

### **Week 2–3**

#### **Feature:** Wallet Notification Bridge (xx → Wallet Inbox API)

**Why it matters:**
Moves the notification experience out of the demo UI and into the wallet’s native inbox, making stealth UX first-class. xx network ensures metadata privacy and avoids having to brute-force decryption
**Who builds it:** Backend Engineer (friend)

#### **Feature:** XCM Pay-with-Stealth UI

**Why it matters:**
Allows a user to **pay invoices on any chain** using stealth balances held on Asset Hub, validated with Hyperbridge. This is the signature cross-chain feature
**Who builds it:** Cat McGee

---

### **Week 3–4**

#### **Feature:** Stealth Top-Up (Swap → Deposit → Stealth)

**Why it matters:**
Users can convert regular wallet assets into stealth balances with a single action
**Who builds it:** Cat McGee

#### **Feature:** Production-ready xx Notification Microservice

**Why it matters:**
Replaces hackathon quick backend with:

- Multiple recipients
- Topic-based routing
- Wallet inbox adapters
- Rate limiting and retry logic
  This becomes our infrastructure backbone.
  **Who builds it:** Backend Engineer (Friend)

---

## 🧠 **Mentoring & Expertise We Need**

**Areas where we need support:**

- Embedding into the Polkadot SDK wallet ecosystem
- Best practices
- Auditing

**Specific expertise we're looking for:**

- Talisman/Subwallet maintainers for wallet UI integration
- Hyperbridge team for advanced storage query patterns + messages
- xx network team to make sure we are using the privacy primitives correctly

---

## 🎯 **WHAT HAPPENS AFTER**

**When M2 is done, we plan to…**

- Launch the first **wallet-native stealth mode** on Polkadot
- Release the **Stealth SDK** for any chain/dapp to accept stealth payments
- Add multi-asset stealth support (USDT, DOT, KSM)
- Begin onboarding early ecosystem partners: NFT mints, creators, DeFi apps

**And 6 months out we see our project achieve:**

- Full XCM-standardized stealth transfers
- Support across multiple wallets (eg Nova)
- SDK for wallets and merchants
- Becoming the privacy layer every Polkadot user interacts with without thinking :)

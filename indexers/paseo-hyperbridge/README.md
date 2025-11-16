# Hyperbridge Paseo Indexer

Local indexer + HTTP service that keeps track of Hyperbridge packets coming from
Paseo and exposes a simple API for the Next.js app (or any other dapp) to read
StealthVault balances and invoice states without talking to Passet Hub directly :)

If you run the app, you will see that you can use Hyperbridge to pay with Passet Hub stealth balances from other Polkadot and EVM chains!

## Features

- Uses the official [`@hyperbridge/sdk`](https://www.npmjs.com/package/%40hyperbridge/sdk)
  `IndexerClient` + `createQueryClient` to follow Paseo packets
- Mirrors the existing Hyperbridge helpers (`stealth-balance`, `stealth-credit`,
  `invoice-status`) as HTTP endpoints
- Persists the last packets/receipts that were observed (JSON file)

## Getting Started

```bash
cd indexers/paseo-hyperbridge
cp env.example .env.local
npm install
npm run dev
```

## HTTP API

All endpoints live under the same base URL (`HYPERBRIDGE_INDEXER_URL`):

| Endpoint           | Description                               | Query params                     |
| ------------------ | ----------------------------------------- | -------------------------------- |
| `/health`          | Service + Hyperbridge status              | —                                |
| `/packets`         | Recent packets captured via the SDK       | `limit`                          |
| `/stealth-balance` | Raw `balances[stealthId][assetId]` lookup | `stealthId`, `assetId`           |
| `/stealth-credit`  | Credit check helper (`balance >= amount`) | `stealthId`, `assetId`, `amount` |
| `/invoice-status`  | Returns `invoices[invoiceId].paid`        | `invoiceId`                      |

## Wiring it into the Next.js app

1. Start the indexer (`npm run dev`)
2. Set the following env vars before starting Next.js:

   ```bash
   cd app
   echo "HYPERBRIDGE_INDEXER_URL=http://localhost:4545" >> .env.local
   npm run dev
   ```

3. The API routes under `/api/hyperbridge/*` will now call the local indexer
   service before falling back to direct RPC

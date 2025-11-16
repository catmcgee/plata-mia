# xxproxy

A tiny Go REST service that wraps the xxDK Go client and exposes two HTTP
endpoints. XX didn't work directly from my frontend, but I've never used Go,
so this was almost entirely vibe-coded (including this README) I don't really know what's going on here.
But as far as I know, it works.

- `GET /api/messages` – returns the last xx direct messages that landed in the
  proxy (looped back to itself for this demo)
- `POST /api/send-self` – sends the provided text through xxDK to the proxy’s
  own codename identity, so it eventually appears in `/api/messages`.\

The Next.js app calls these endpoints via `/api/xx/inbox` and
`/api/xx/send-test`, which keeps browser-side code free from xxDK WASM and
avoids CORS issues with the public gateways.

## Prerequisites

1. Go 1.21 or newer.
2. The xx network mainnet certificate. Download it once:

   ```bash
   curl -o xxproxy/mainnet.crt https://elixxir-bins.s3.us-west-1.amazonaws.com/ndf/mainnet.crt
   ```

   (The file is small; keep it alongside the Go code.)

## Configuration

Environment variables (all optional – sensible defaults are provided):

| Variable                  | Default                                                            | Description                                            |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `XX_PROXY_LISTEN`         | `:8787`                                                            | Address the proxy listens on.                          |
| `XX_PROXY_STATE_PATH`     | `./xxproxy-state`                                                  | Directory where xxDK stores state.                     |
| `XX_PROXY_STATE_PASSWORD` | `Hello`                                                            | Password used to protect the state directory.          |
| `XX_PROXY_NDF_PATH`       | `./xxproxy.ndf`                                                    | Local cache of the downloaded NDF.                     |
| `XX_PROXY_NDF_URL`        | `https://elixxir-bins.s3.us-west-1.amazonaws.com/ndf/mainnet.json` | Source URL for the signed NDF.                         |
| `XX_PROXY_CERT_PATH`      | `./mainnet.crt`                                                    | Path to the certificate downloaded above.              |
| `XX_PROXY_STORAGE_KEY`    | `xxproxy-dm-id`                                                    | Key used inside the xxDK KV store for the DM identity. |
| `XX_PROXY_LOG_LEVEL`      | `1`                                                                | `jwalterweatherman` log level (0=TRACE … 6=FATAL).     |

## Running

```bash
cd xxproxy
go mod tidy          # First time to pull xxdk dependencies
go run .             # Starts the proxy on :8787
```

Once running, set `XX_PROXY_BASE_URL=http://localhost:8787` in
`app/.env.local` so the Next.js API routes know where to forward inbox
requests.

The proxy will download the NDF (if necessary), bootstrap a cmix client,
create a DM identity (stored in the xxDK KV), and start the network
follower. All messages are looped back to the proxy itself so they show
up in the UI after the xx mixnet delivers them.

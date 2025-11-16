import { config as loadEnv } from "dotenv";
import path from "node:path";
import { z } from "zod";

const ENV_CANDIDATES = [
  process.env.HYPERBRIDGE_INDEXER_ENV,
  ".env.local",
  ".env",
].filter(Boolean) as string[];

for (const candidate of ENV_CANDIDATES) {
  loadEnv({
    path: path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate),
    override: true,
  });
}

const LOG_LEVELS = ["silent", "error", "warn", "info", "debug", "trace"] as const;

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  HYPERBRIDGE_INDEXER_PORT: z.coerce.number().int().positive().default(4545),
  HYPERBRIDGE_INDEXER_CACHE: z
    .string()
    .transform((value) =>
      value ? path.resolve(process.cwd(), value) : path.resolve(process.cwd(), ".cache/state.json")
    )
    .default(path.resolve(process.cwd(), ".cache/state.json")),
  HYPERBRIDGE_QUERY_URL: z
    .string()
    .url("Set HYPERBRIDGE_QUERY_URL to the Hyperbridge GraphQL endpoint"),
  HYPERBRIDGE_SOURCE_CONSENSUS_STATE_ID: z
    .string()
    .min(1, "Provide HYPERBRIDGE_SOURCE_CONSENSUS_STATE_ID (e.g. PASEO0)"),
  HYPERBRIDGE_SOURCE_STATE_MACHINE_ID: z
    .string()
    .min(1, "Provide HYPERBRIDGE_SOURCE_STATE_MACHINE_ID (e.g. SUBSTRATE-1000)"),
  HYPERBRIDGE_SOURCE_HOST: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "HYPERBRIDGE_SOURCE_HOST must be a 0x-prefixed address"),
  PASEO_RPC_URL: z
    .string()
    .url()
    .default("https://paseo.rpc.amforc.com"),
  HYPERBRIDGE_DEST_CONSENSUS_STATE_ID: z
    .string()
    .min(1, "Provide HYPERBRIDGE_DEST_CONSENSUS_STATE_ID"),
  HYPERBRIDGE_DEST_STATE_MACHINE_ID: z
    .string()
    .min(1, "Provide HYPERBRIDGE_DEST_STATE_MACHINE_ID"),
  HYPERBRIDGE_DEST_HOST: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "HYPERBRIDGE_DEST_HOST must be a 0x-prefixed address"),
  HYPERBRIDGE_DEST_CHAIN_ID: z
    .union([z.string(), z.number(), z.bigint()])
    .transform((value) => BigInt(value))
    .default(420420422n),
  PASSET_RPC_URL: z
    .string()
    .url()
    .default("https://testnet-passet-hub-eth-rpc.polkadot.io"),
  HYPERBRIDGE_INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  HYPERBRIDGE_INDEXER_MAX_EVENTS: z.coerce.number().int().positive().max(2000).default(256),
  STEALTH_VAULT_ADDRESS_PASSET: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "STEALTH_VAULT_ADDRESS_PASSET must be a 0x-prefixed address"),
});

export type RuntimeConfig = z.infer<typeof envSchema>;

export function buildConfig(): RuntimeConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`);
    throw new Error(`Invalid Hyperbridge indexer config:\n${formatted.join("\n")}`);
  }
  return parsed.data;
}


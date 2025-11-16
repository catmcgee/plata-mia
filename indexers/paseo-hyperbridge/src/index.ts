import pino from "pino";

import { buildConfig } from "./config";
import { createHyperbridgeService } from "./hyperbridge";
import { createServer } from "./server";
import { IndexerState } from "./state";

async function main() {
  const config = buildConfig();
  const logger = pino({
    level: config.LOG_LEVEL,
  });

  logger.info("Starting Hyperbridge Paseo indexer…");

  const state = new IndexerState(
    config.HYPERBRIDGE_INDEXER_CACHE,
    config.HYPERBRIDGE_INDEXER_MAX_EVENTS,
    logger
  );

  await state.hydrateFromDisk();

  const hyperbridge = createHyperbridgeService(config, state, logger);
  await hyperbridge.start();

  const server = createServer(config, hyperbridge, logger);
  await server.start();

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Received shutdown signal");
    await server.stop();
    await hyperbridge.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start Hyperbridge indexer", error);
  process.exit(1);
});


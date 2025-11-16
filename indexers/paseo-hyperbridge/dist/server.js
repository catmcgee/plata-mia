import fastify from "fastify";
import { z } from "zod";
const stealthBalanceQuerySchema = z.object({
    stealthId: z.string(),
    assetId: z.string(),
});
const stealthCreditQuerySchema = stealthBalanceQuerySchema.extend({
    amount: z.string().refine((val) => {
        try {
            BigInt(val);
            return true;
        }
        catch {
            return false;
        }
    }, { message: "amount must be a valid number or hex string convertible to BigInt" }),
});
const invoiceStatusQuerySchema = z.object({
    invoiceId: z.string(),
});
const packetsQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(512).default(50),
});
export function createServer(config, hyperbridge, logger) {
    const app = fastify({
        logger,
    });
    app.get("/health", async () => {
        const snapshot = hyperbridge.snapshot();
        return {
            ok: true,
            chainId: snapshot.packets.at(0)?.height ?? null,
            packetsCached: snapshot.packets.length,
            receiptsCached: snapshot.receipts.length,
            lastPacketHeight: snapshot.lastPacketHeight,
            lastReceiptHeight: snapshot.lastReceiptHeight,
            config: {
                port: config.HYPERBRIDGE_INDEXER_PORT,
                source: {
                    consensusStateId: config.HYPERBRIDGE_SOURCE_CONSENSUS_STATE_ID,
                    rpcUrl: config.PASEO_RPC_URL,
                    stateMachineId: config.HYPERBRIDGE_SOURCE_STATE_MACHINE_ID,
                    host: config.HYPERBRIDGE_SOURCE_HOST,
                },
                dest: {
                    consensusStateId: config.HYPERBRIDGE_DEST_CONSENSUS_STATE_ID,
                    rpcUrl: config.PASSET_RPC_URL,
                    stateMachineId: config.HYPERBRIDGE_DEST_STATE_MACHINE_ID,
                    host: config.HYPERBRIDGE_DEST_HOST,
                    chainId: config.HYPERBRIDGE_DEST_CHAIN_ID.toString(),
                },
            },
        };
    });
    app.get("/packets", async (request, reply) => {
        try {
            const { limit } = packetsQuerySchema.parse(request.query);
            const snapshot = hyperbridge.snapshot();
            return {
                packets: snapshot.packets.slice(0, limit),
                receipts: snapshot.receipts.slice(0, limit),
                lastPacketHeight: snapshot.lastPacketHeight,
                lastReceiptHeight: snapshot.lastReceiptHeight,
            };
        }
        catch (error) {
            reply.code(400);
            return { error: error.message };
        }
    });
    app.get("/stealth-balance", async (request, reply) => {
        try {
            const parsed = stealthBalanceQuerySchema.parse(request.query);
            const stealthId = hyperbridge.assertHex32(parsed.stealthId, "stealthId");
            const assetId = hyperbridge.assertHex32(parsed.assetId, "assetId");
            const result = await hyperbridge.queryStealthBalance({ stealthId, assetId });
            return {
                ...serializeBalance(result),
            };
        }
        catch (error) {
            reply.code(error instanceof Error && /must be/.test(error.message) ? 400 : 500);
            return { error: error.message };
        }
    });
    app.get("/stealth-credit", async (request, reply) => {
        try {
            const parsed = stealthCreditQuerySchema.parse(request.query);
            const stealthId = hyperbridge.assertHex32(parsed.stealthId, "stealthId");
            const assetId = hyperbridge.assertHex32(parsed.assetId, "assetId");
            const amount = BigInt(parsed.amount);
            const result = await hyperbridge.queryStealthCredit({ stealthId, assetId, amount });
            return {
                ...serializeCredit(result),
            };
        }
        catch (error) {
            reply.code(error instanceof Error && /must be/.test(error.message) ? 400 : 500);
            return { error: error.message };
        }
    });
    app.get("/aggregated-stealth-credit", async (request, reply) => {
        try {
            const parsed = z
                .object({
                stealthPublicId: z.string(),
                assetId: z.string(),
                amount: z.string().refine((val) => {
                    try {
                        BigInt(val);
                        return true;
                    }
                    catch {
                        return false;
                    }
                }, { message: "amount must be a valid number or hex string convertible to BigInt" }),
            })
                .parse(request.query);
            const assetId = hyperbridge.assertHex32(parsed.assetId, "assetId");
            const amount = BigInt(parsed.amount);
            const result = await hyperbridge.queryAggregatedBalance({
                stealthPublicId: parsed.stealthPublicId,
                assetId,
            });
            const canPay = result.raw >= amount;
            return {
                ...serializeCredit({ ...result, requestedAmount: amount, canPay }),
            };
        }
        catch (error) {
            reply.code(error instanceof Error && /must be/.test(error.message) ? 400 : 500);
            return { error: error.message };
        }
    });
    app.get("/invoice-status", async (request, reply) => {
        try {
            const parsed = invoiceStatusQuerySchema.parse(request.query);
            const invoiceId = hyperbridge.assertHex32(parsed.invoiceId, "invoiceId");
            const result = await hyperbridge.queryInvoiceStatus(invoiceId);
            return {
                chainId: result.chainId.toString(),
                vaultAddress: result.vaultAddress,
                invoiceId: result.invoiceId,
                slot: result.slot,
                raw: result.raw.toString(),
                paid: result.paid,
            };
        }
        catch (error) {
            reply.code(error instanceof Error && /must be/.test(error.message) ? 400 : 500);
            return { error: error.message };
        }
    });
    return {
        start: async () => {
            await app.listen({
                port: config.HYPERBRIDGE_INDEXER_PORT,
                host: "0.0.0.0",
            });
            logger.info({ port: config.HYPERBRIDGE_INDEXER_PORT }, "HTTP server ready");
        },
        stop: async () => {
            await app.close();
        },
    };
}
function serializeBalance(result) {
    return {
        chainId: result.chainId.toString(),
        vaultAddress: result.vaultAddress,
        stealthId: result.stealthId,
        assetId: result.assetId,
        slot: result.slot,
        raw: result.raw.toString(),
        human: result.human,
    };
}
function serializeCredit(result) {
    return {
        ...serializeBalance(result),
        requestedAmount: result.requestedAmount.toString(),
        canPay: result.canPay,
    };
}

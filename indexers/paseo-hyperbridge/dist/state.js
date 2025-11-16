import { promises as fs } from "node:fs";
import path from "node:path";
export class IndexerState {
    cacheFile;
    maxEntries;
    logger;
    packets = [];
    receipts = [];
    lastPacketHeight = 0;
    lastReceiptHeight = 0;
    constructor(cacheFile, maxEntries, logger) {
        this.cacheFile = cacheFile;
        this.maxEntries = maxEntries;
        this.logger = logger;
    }
    async hydrateFromDisk() {
        try {
            const data = await fs.readFile(this.cacheFile, "utf8");
            const parsed = JSON.parse(data);
            this.packets = parsed.packets ?? [];
            this.receipts = parsed.receipts ?? [];
            this.lastPacketHeight = parsed.lastPacketHeight ?? 0;
            this.lastReceiptHeight = parsed.lastReceiptHeight ?? 0;
            this.logger.info({ packets: this.packets.length, receipts: this.receipts.length }, "Loaded cached Hyperbridge packets");
        }
        catch (error) {
            if (error.code !== "ENOENT") {
                this.logger.warn({ err: error }, "Failed to hydrate Hyperbridge cache");
            }
        }
    }
    pushPacket(record) {
        this.packets = [record, ...this.packets].slice(0, this.maxEntries);
        if (record.height) {
            this.lastPacketHeight = Math.max(this.lastPacketHeight, record.height);
        }
        this.persist();
    }
    pushReceipt(record) {
        this.receipts = [record, ...this.receipts].slice(0, this.maxEntries);
        if (record.height) {
            this.lastReceiptHeight = Math.max(this.lastReceiptHeight, record.height);
        }
        this.persist();
    }
    listPackets(limit) {
        return this.packets.slice(0, limit);
    }
    listReceipts(limit) {
        return this.receipts.slice(0, limit);
    }
    snapshot() {
        return {
            packets: this.packets,
            receipts: this.receipts,
            lastPacketHeight: this.lastPacketHeight,
            lastReceiptHeight: this.lastReceiptHeight,
            lastUpdated: new Date().toISOString(),
        };
    }
    async persist() {
        try {
            const payload = {
                packets: this.packets,
                receipts: this.receipts,
                lastPacketHeight: this.lastPacketHeight,
                lastReceiptHeight: this.lastReceiptHeight,
                lastUpdated: new Date().toISOString(),
            };
            await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
            await fs.writeFile(this.cacheFile, JSON.stringify(payload, null, 2), "utf8");
        }
        catch (error) {
            this.logger.warn({ err: error }, "Failed to persist Hyperbridge cache");
        }
    }
}

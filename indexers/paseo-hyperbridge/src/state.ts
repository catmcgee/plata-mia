import { promises as fs } from "node:fs";
import path from "node:path";
import type { Logger } from "pino";

export type PacketRecord = {
  id: string;
  height?: number;
  source?: string;
  dest?: string;
  timestamp?: number;
  raw: unknown;
};

export type IndexerSnapshot = {
  packets: PacketRecord[];
  receipts: PacketRecord[];
  lastPacketHeight: number;
  lastReceiptHeight: number;
  lastUpdated?: string;
};

type PersistedState = {
  packets: PacketRecord[];
  receipts: PacketRecord[];
  lastPacketHeight: number;
  lastReceiptHeight: number;
  lastUpdated?: string;
};

export class IndexerState {
  private packets: PacketRecord[] = [];
  private receipts: PacketRecord[] = [];
  private lastPacketHeight = 0;
  private lastReceiptHeight = 0;

  constructor(
    private readonly cacheFile: string,
    private readonly maxEntries: number,
    private readonly logger: Logger
  ) {}

  async hydrateFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.cacheFile, "utf8");
      const parsed = JSON.parse(data) as PersistedState;
      this.packets = parsed.packets ?? [];
      this.receipts = parsed.receipts ?? [];
      this.lastPacketHeight = parsed.lastPacketHeight ?? 0;
      this.lastReceiptHeight = parsed.lastReceiptHeight ?? 0;
      this.logger.info(
        { packets: this.packets.length, receipts: this.receipts.length },
        "Loaded cached Hyperbridge packets"
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn({ err: error }, "Failed to hydrate Hyperbridge cache");
      }
    }
  }

  pushPacket(record: PacketRecord) {
    this.packets = [record, ...this.packets].slice(0, this.maxEntries);
    if (record.height) {
      this.lastPacketHeight = Math.max(this.lastPacketHeight, record.height);
    }
    this.persist();
  }

  pushReceipt(record: PacketRecord) {
    this.receipts = [record, ...this.receipts].slice(0, this.maxEntries);
    if (record.height) {
      this.lastReceiptHeight = Math.max(this.lastReceiptHeight, record.height);
    }
    this.persist();
  }

  listPackets(limit: number): PacketRecord[] {
    return this.packets.slice(0, limit);
  }

  listReceipts(limit: number): PacketRecord[] {
    return this.receipts.slice(0, limit);
  }

  snapshot(): IndexerSnapshot {
    return {
      packets: this.packets,
      receipts: this.receipts,
      lastPacketHeight: this.lastPacketHeight,
      lastReceiptHeight: this.lastReceiptHeight,
      lastUpdated: new Date().toISOString(),
    };
  }

  private async persist() {
    try {
      const payload: PersistedState = {
        packets: this.packets,
        receipts: this.receipts,
        lastPacketHeight: this.lastPacketHeight,
        lastReceiptHeight: this.lastReceiptHeight,
        lastUpdated: new Date().toISOString(),
      };
      await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
      await fs.writeFile(this.cacheFile, JSON.stringify(payload, null, 2), "utf8");
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to persist Hyperbridge cache");
    }
  }
}


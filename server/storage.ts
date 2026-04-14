import {
  type Holding, type InsertHolding, holdings,
  type Enrichment, type InsertEnrichment, enrichments,
  type Snapshot, type InsertSnapshot, snapshots,
  type RelationshipGraph, type InsertRelationshipGraph, relationshipGraphs,
  type Thesis, type InsertThesis, theses,
  type DevilsAdvocate, type InsertDevilsAdvocate, devils_advocates,
  type WmbtItem, type InsertWmbtItem, wmbt_items,
  type PriceAlert, type InsertPriceAlert, price_alerts,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, asc } from "drizzle-orm";

const DB_PATH = process.env.DB_PATH || (process.env.NODE_ENV === "production" ? "/tmp/data.db" : "data.db");
const sqlite = new Database(DB_PATH);
try { sqlite.pragma("journal_mode = WAL"); } catch (e) { /* WAL not supported on this fs */ }

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS theses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    why_own TEXT NOT NULL,
    key_drivers TEXT NOT NULL,
    risks TEXT NOT NULL,
    break_conditions TEXT NOT NULL,
    what_must_be_true TEXT NOT NULL,
    valuation_view TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ai'
  );
  CREATE TABLE IF NOT EXISTS devils_advocates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    bear_headline TEXT NOT NULL,
    counter_arguments TEXT NOT NULL,
    blind_spots TEXT NOT NULL,
    worst_case_scenario TEXT NOT NULL,
    conviction_challenge TEXT NOT NULL,
    verdict TEXT NOT NULL,
    generated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wmbt_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    condition TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unverified',
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS price_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    target_value REAL NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    triggered INTEGER NOT NULL DEFAULT 0,
    triggered_at TEXT,
    created_at TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite);

export interface IStorage {
  // Holdings
  getAllHoldings(): Promise<Holding[]>;
  getHolding(id: number): Promise<Holding | undefined>;
  createHolding(holding: InsertHolding): Promise<Holding>;
  updateHolding(id: number, holding: Partial<InsertHolding>): Promise<Holding | undefined>;
  deleteHolding(id: number): Promise<void>;
  clearAndImport(holdingsList: InsertHolding[]): Promise<Holding[]>;
  countHoldings(): Promise<number>;
  // Enrichments
  getAllEnrichments(): Promise<Enrichment[]>;
  getEnrichment(ticker: string): Promise<Enrichment | undefined>;
  upsertEnrichment(data: InsertEnrichment): Promise<Enrichment>;
  // Snapshots
  getAllSnapshots(): Promise<Snapshot[]>;
  createSnapshot(data: InsertSnapshot): Promise<Snapshot>;
  // Relationship Graphs
  getRelationshipGraph(tickerHash: string): Promise<RelationshipGraph | undefined>;
  upsertRelationshipGraph(data: InsertRelationshipGraph): Promise<RelationshipGraph>;
  // Theses
  getThesis(ticker: string): Promise<Thesis | undefined>;
  getAllTheses(): Promise<Thesis[]>;
  upsertThesis(data: InsertThesis): Promise<Thesis>;
  deleteThesis(ticker: string): Promise<void>;
  // Devils Advocates
  getDevilsAdvocate(ticker: string): Promise<DevilsAdvocate | undefined>;
  getAllDevilsAdvocates(): Promise<DevilsAdvocate[]>;
  upsertDevilsAdvocate(data: InsertDevilsAdvocate): Promise<DevilsAdvocate>;
  deleteDevilsAdvocate(ticker: string): Promise<void>;
  // WMBT Items
  getWmbtItems(ticker: string): Promise<WmbtItem[]>;
  createWmbtItem(data: InsertWmbtItem): Promise<WmbtItem>;
  updateWmbtItem(id: number, data: Partial<InsertWmbtItem>): Promise<WmbtItem | undefined>;
  deleteWmbtItem(id: number): Promise<void>;
  // Price Alerts
  getAllAlerts(): Promise<PriceAlert[]>;
  createAlert(data: InsertPriceAlert): Promise<PriceAlert>;
  deleteAlert(id: number): Promise<void>;
  getUntriggeredAlerts(): Promise<PriceAlert[]>;
  markAlertTriggered(id: number, triggeredAt: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ── Holdings ──
  async getAllHoldings(): Promise<Holding[]> {
    return db.select().from(holdings).all();
  }

  async getHolding(id: number): Promise<Holding | undefined> {
    return db.select().from(holdings).where(eq(holdings.id, id)).get();
  }

  async createHolding(holding: InsertHolding): Promise<Holding> {
    return db.insert(holdings).values(holding).returning().get();
  }

  async updateHolding(id: number, holding: Partial<InsertHolding>): Promise<Holding | undefined> {
    const existing = db.select().from(holdings).where(eq(holdings.id, id)).get();
    if (!existing) return undefined;
    return db.update(holdings).set(holding).where(eq(holdings.id, id)).returning().get();
  }

  async deleteHolding(id: number): Promise<void> {
    db.delete(holdings).where(eq(holdings.id, id)).run();
  }

  async clearAndImport(holdingsList: InsertHolding[]): Promise<Holding[]> {
    db.delete(holdings).run();
    const results: Holding[] = [];
    for (const h of holdingsList) {
      const created = db.insert(holdings).values(h).returning().get();
      results.push(created);
    }
    return results;
  }

  async countHoldings(): Promise<number> {
    const rows = db.select().from(holdings).all();
    return rows.length;
  }

  // ── Enrichments ──
  async getAllEnrichments(): Promise<Enrichment[]> {
    return db.select().from(enrichments).all();
  }

  async getEnrichment(ticker: string): Promise<Enrichment | undefined> {
    return db.select().from(enrichments).where(eq(enrichments.ticker, ticker)).get();
  }

  async upsertEnrichment(data: InsertEnrichment): Promise<Enrichment> {
    const existing = db.select().from(enrichments).where(eq(enrichments.ticker, data.ticker)).get();
    if (existing) {
      return db.update(enrichments).set(data).where(eq(enrichments.ticker, data.ticker)).returning().get();
    }
    return db.insert(enrichments).values(data).returning().get();
  }

  // ── Snapshots ──
  async getAllSnapshots(): Promise<Snapshot[]> {
    return db.select().from(snapshots).orderBy(asc(snapshots.date)).all();
  }

  async createSnapshot(data: InsertSnapshot): Promise<Snapshot> {
    return db.insert(snapshots).values(data).returning().get();
  }

  // ── Relationship Graphs ──
  async getRelationshipGraph(tickerHash: string): Promise<RelationshipGraph | undefined> {
    return db.select().from(relationshipGraphs).where(eq(relationshipGraphs.ticker_hash, tickerHash)).get();
  }

  async upsertRelationshipGraph(data: InsertRelationshipGraph): Promise<RelationshipGraph> {
    const existing = db.select().from(relationshipGraphs).where(eq(relationshipGraphs.ticker_hash, data.ticker_hash)).get();
    if (existing) {
      return db.update(relationshipGraphs).set(data).where(eq(relationshipGraphs.ticker_hash, data.ticker_hash)).returning().get();
    }
    return db.insert(relationshipGraphs).values(data).returning().get();
  }

  // ── Theses ──
  async getThesis(ticker: string): Promise<Thesis | undefined> {
    return db.select().from(theses).where(eq(theses.ticker, ticker)).get();
  }

  async getAllTheses(): Promise<Thesis[]> {
    return db.select().from(theses).all();
  }

  async upsertThesis(data: InsertThesis): Promise<Thesis> {
    const existing = db.select().from(theses).where(eq(theses.ticker, data.ticker)).get();
    if (existing) {
      return db.update(theses).set(data).where(eq(theses.ticker, data.ticker)).returning().get();
    }
    return db.insert(theses).values(data).returning().get();
  }

  async deleteThesis(ticker: string): Promise<void> {
    db.delete(theses).where(eq(theses.ticker, ticker)).run();
  }

  // ── Devils Advocates ──
  async getDevilsAdvocate(ticker: string): Promise<DevilsAdvocate | undefined> {
    return db.select().from(devils_advocates).where(eq(devils_advocates.ticker, ticker)).get();
  }

  async getAllDevilsAdvocates(): Promise<DevilsAdvocate[]> {
    return db.select().from(devils_advocates).all();
  }

  async upsertDevilsAdvocate(data: InsertDevilsAdvocate): Promise<DevilsAdvocate> {
    const existing = db.select().from(devils_advocates).where(eq(devils_advocates.ticker, data.ticker)).get();
    if (existing) {
      return db.update(devils_advocates).set(data).where(eq(devils_advocates.ticker, data.ticker)).returning().get();
    }
    return db.insert(devils_advocates).values(data).returning().get();
  }

  async deleteDevilsAdvocate(ticker: string): Promise<void> {
    db.delete(devils_advocates).where(eq(devils_advocates.ticker, ticker)).run();
  }

  // ── WMBT Items ──
  async getWmbtItems(ticker: string): Promise<WmbtItem[]> {
    return db.select().from(wmbt_items).where(eq(wmbt_items.ticker, ticker)).all();
  }

  async createWmbtItem(data: InsertWmbtItem): Promise<WmbtItem> {
    return db.insert(wmbt_items).values(data).returning().get();
  }

  async updateWmbtItem(id: number, data: Partial<InsertWmbtItem>): Promise<WmbtItem | undefined> {
    const existing = db.select().from(wmbt_items).where(eq(wmbt_items.id, id)).get();
    if (!existing) return undefined;
    return db.update(wmbt_items).set(data).where(eq(wmbt_items.id, id)).returning().get();
  }

  async deleteWmbtItem(id: number): Promise<void> {
    db.delete(wmbt_items).where(eq(wmbt_items.id, id)).run();
  }

  // ── Price Alerts ──
  async getAllAlerts(): Promise<PriceAlert[]> {
    return db.select().from(price_alerts).orderBy(asc(price_alerts.created_at)).all();
  }

  async createAlert(data: InsertPriceAlert): Promise<PriceAlert> {
    return db.insert(price_alerts).values(data).returning().get();
  }

  async deleteAlert(id: number): Promise<void> {
    db.delete(price_alerts).where(eq(price_alerts.id, id)).run();
  }

  async getUntriggeredAlerts(): Promise<PriceAlert[]> {
    return db.select().from(price_alerts).where(eq(price_alerts.triggered, false)).all();
  }

  async markAlertTriggered(id: number, triggeredAt: string): Promise<void> {
    db.update(price_alerts).set({ triggered: true, triggered_at: triggeredAt }).where(eq(price_alerts.id, id)).run();
  }
}

export const storage = new DatabaseStorage();

import { createClient } from "@libsql/client";
import type {
  Holding, InsertHolding,
  Enrichment, InsertEnrichment,
  Snapshot, InsertSnapshot,
  RelationshipGraph, InsertRelationshipGraph,
  Thesis, InsertThesis,
  DevilsAdvocate, InsertDevilsAdvocate,
  WmbtItem, InsertWmbtItem,
  PriceAlert, InsertPriceAlert,
  WatchlistItem, InsertWatchlist,
  Milestone, InsertMilestone,
  DividendLog, InsertDividendLog,
  Transaction, InsertTransaction,
  ScenarioRun, InsertScenarioRun,
} from "@shared/schema";

// ── Turso client ──────────────────────────────────────────────────────────────

const tursoUrl   = process.env.TURSO_DATABASE_URL || "";
const tursoToken = process.env.TURSO_AUTH_TOKEN   || "";

if (!tursoUrl) {
  console.error("TURSO_DATABASE_URL is not set — storage will fail");
}

export const db = createClient({
  url:       tursoUrl,
  authToken: tursoToken,
});

// ── Bootstrap all tables ──────────────────────────────────────────────────────

export async function initDb(): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS holdings (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker   TEXT    NOT NULL UNIQUE,
      shares   REAL    NOT NULL,
      avg_cost REAL    NOT NULL,
      bdd_type TEXT    NOT NULL DEFAULT 'engine',
      sector   TEXT    NOT NULL DEFAULT '',
      notes    TEXT    NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS enrichments (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker             TEXT  NOT NULL UNIQUE,
      company_name       TEXT,
      industry           TEXT,
      market_cap         REAL,
      beta               REAL,
      pe_ratio           REAL,
      pb_ratio           REAL,
      ps_ratio           REAL,
      pfcf_ratio         REAL,
      ev_ebitda          REAL,
      roic               REAL,
      roe                REAL,
      gross_margin       REAL,
      operating_margin   REAL,
      net_margin         REAL,
      fcf_margin         REAL,
      revenue_growth_5y  REAL,
      eps_growth_5y      REAL,
      net_debt_ebitda    REAL,
      dividend_yield     REAL,
      eps_ttm            REAL,
      fcf_per_share      REAL,
      book_value_per_share REAL,
      revenue_per_share  REAL,
      pe_5y_median       REAL,
      pb_5y_median       REAL,
      ps_5y_median       REAL,
      pfcf_5y_median     REAL,
      enriched_at        TEXT
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT  NOT NULL,
      total_value REAL  NOT NULL,
      total_cost  REAL  NOT NULL,
      deposits    REAL  DEFAULT 0,
      withdrawals REAL  DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS relationship_graphs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker_hash TEXT  NOT NULL UNIQUE,
      result_json TEXT  NOT NULL,
      computed_at TEXT  NOT NULL
    );

    CREATE TABLE IF NOT EXISTS theses (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker           TEXT NOT NULL UNIQUE,
      summary          TEXT NOT NULL,
      why_own          TEXT NOT NULL,
      key_drivers      TEXT NOT NULL,
      risks            TEXT NOT NULL,
      break_conditions TEXT NOT NULL,
      what_must_be_true TEXT NOT NULL,
      valuation_view   TEXT NOT NULL,
      generated_at     TEXT NOT NULL,
      source           TEXT NOT NULL DEFAULT 'ai'
    );

    CREATE TABLE IF NOT EXISTS devils_advocates (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker              TEXT NOT NULL UNIQUE,
      bear_headline       TEXT NOT NULL,
      counter_arguments   TEXT NOT NULL,
      blind_spots         TEXT NOT NULL,
      worst_case_scenario TEXT NOT NULL,
      conviction_challenge TEXT NOT NULL,
      verdict             TEXT NOT NULL,
      generated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wmbt_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker     TEXT NOT NULL,
      condition  TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'unverified',
      notes      TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_alerts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker       TEXT NOT NULL,
      alert_type   TEXT NOT NULL,
      target_value REAL NOT NULL,
      label        TEXT NOT NULL DEFAULT '',
      triggered    INTEGER NOT NULL DEFAULT 0,
      triggered_at TEXT,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker      TEXT NOT NULL UNIQUE,
      buy_below   REAL,
      notes       TEXT NOT NULL DEFAULT '',
      sector      TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      label         TEXT NOT NULL,
      target_value  REAL NOT NULL,
      target_date   TEXT,
      notes         TEXT NOT NULL DEFAULT '',
      achieved      INTEGER NOT NULL DEFAULT 0,
      achieved_at   TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dividends_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker        TEXT NOT NULL,
      amount_usd    REAL NOT NULL,
      received_date TEXT NOT NULL,
      notes         TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker        TEXT NOT NULL,
      action        TEXT NOT NULL DEFAULT 'buy',
      shares        REAL NOT NULL,
      price_usd     REAL NOT NULL,
      amount_usd    REAL NOT NULL,
      tx_date       TEXT NOT NULL,
      notes         TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenario_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id   TEXT NOT NULL,
      severity      TEXT NOT NULL,
      result_json   TEXT NOT NULL,
      run_at        TEXT NOT NULL
    );
  `);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map a libsql Row (array-indexed) to a plain object using column names */
function rowToObj(columns: string[], row: any[]): Record<string, any> {
  const obj: Record<string, any> = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

function toHolding(r: Record<string, any>): Holding {
  return {
    id:       r.id as number,
    ticker:   r.ticker as string,
    shares:   r.shares as number,
    avg_cost: r.avg_cost as number,
    bdd_type: r.bdd_type as string,
    sector:   r.sector as string,
    notes:    r.notes as string,
  };
}

function toEnrichment(r: Record<string, any>): Enrichment {
  return {
    id:                  r.id as number,
    ticker:              r.ticker as string,
    company_name:        r.company_name as string | null,
    industry:            r.industry as string | null,
    market_cap:          r.market_cap as number | null,
    beta:                r.beta as number | null,
    pe_ratio:            r.pe_ratio as number | null,
    pb_ratio:            r.pb_ratio as number | null,
    ps_ratio:            r.ps_ratio as number | null,
    pfcf_ratio:          r.pfcf_ratio as number | null,
    ev_ebitda:           r.ev_ebitda as number | null,
    roic:                r.roic as number | null,
    roe:                 r.roe as number | null,
    gross_margin:        r.gross_margin as number | null,
    operating_margin:    r.operating_margin as number | null,
    net_margin:          r.net_margin as number | null,
    fcf_margin:          r.fcf_margin as number | null,
    revenue_growth_5y:   r.revenue_growth_5y as number | null,
    eps_growth_5y:       r.eps_growth_5y as number | null,
    net_debt_ebitda:     r.net_debt_ebitda as number | null,
    dividend_yield:      r.dividend_yield as number | null,
    eps_ttm:             r.eps_ttm as number | null,
    fcf_per_share:       r.fcf_per_share as number | null,
    book_value_per_share: r.book_value_per_share as number | null,
    revenue_per_share:   r.revenue_per_share as number | null,
    pe_5y_median:        r.pe_5y_median as number | null,
    pb_5y_median:        r.pb_5y_median as number | null,
    ps_5y_median:        r.ps_5y_median as number | null,
    pfcf_5y_median:      r.pfcf_5y_median as number | null,
    enriched_at:         r.enriched_at as string | null,
  };
}

function toSnapshot(r: Record<string, any>): Snapshot {
  return {
    id:          r.id as number,
    date:        r.date as string,
    total_value: r.total_value as number,
    total_cost:  r.total_cost as number,
    deposits:    (r.deposits ?? 0) as number,
    withdrawals: (r.withdrawals ?? 0) as number,
  };
}

function toRelationshipGraph(r: Record<string, any>): RelationshipGraph {
  return {
    id:          r.id as number,
    ticker_hash: r.ticker_hash as string,
    result_json: r.result_json as string,
    computed_at: r.computed_at as string,
  };
}

function toThesis(r: Record<string, any>): Thesis {
  return {
    id:                r.id as number,
    ticker:            r.ticker as string,
    summary:           r.summary as string,
    why_own:           r.why_own as string,
    key_drivers:       r.key_drivers as string,
    risks:             r.risks as string,
    break_conditions:  r.break_conditions as string,
    what_must_be_true: r.what_must_be_true as string,
    valuation_view:    r.valuation_view as string,
    generated_at:      r.generated_at as string,
    source:            r.source as string,
  };
}

function toDevilsAdvocate(r: Record<string, any>): DevilsAdvocate {
  return {
    id:                   r.id as number,
    ticker:               r.ticker as string,
    bear_headline:        r.bear_headline as string,
    counter_arguments:    r.counter_arguments as string,
    blind_spots:          r.blind_spots as string,
    worst_case_scenario:  r.worst_case_scenario as string,
    conviction_challenge: r.conviction_challenge as string,
    verdict:              r.verdict as string,
    generated_at:         r.generated_at as string,
  };
}

function toWmbtItem(r: Record<string, any>): WmbtItem {
  return {
    id:         r.id as number,
    ticker:     r.ticker as string,
    condition:  r.condition as string,
    status:     r.status as string,
    notes:      r.notes as string,
    updated_at: r.updated_at as string,
  };
}

function toPriceAlert(r: Record<string, any>): PriceAlert {
  return {
    id:           r.id as number,
    ticker:       r.ticker as string,
    alert_type:   r.alert_type as string,
    target_value: r.target_value as number,
    label:        r.label as string,
    triggered:    Boolean(r.triggered),
    triggered_at: r.triggered_at as string | null,
    created_at:   r.created_at as string,
  };
}

function toWatchlistItem(r: Record<string, any>): WatchlistItem {
  return {
    id:         r.id as number,
    ticker:     r.ticker as string,
    buy_below:  r.buy_below as number | null,
    notes:      r.notes as string,
    sector:     r.sector as string,
    created_at: r.created_at as string,
  };
}

function toMilestone(r: Record<string, any>): Milestone {
  return {
    id:           r.id as number,
    label:        r.label as string,
    target_value: r.target_value as number,
    target_date:  r.target_date as string | null,
    notes:        r.notes as string,
    achieved:     Boolean(r.achieved),
    achieved_at:  r.achieved_at as string | null,
    created_at:   r.created_at as string,
  };
}

function toDividendLog(r: Record<string, any>): DividendLog {
  return {
    id:            r.id as number,
    ticker:        r.ticker as string,
    amount_usd:    r.amount_usd as number,
    received_date: r.received_date as string,
    notes:         r.notes as string,
    created_at:    r.created_at as string,
  };
}

function toTransaction(r: Record<string, any>): Transaction {
  return {
    id:         r.id as number,
    ticker:     r.ticker as string,
    action:     r.action as string,
    shares:     r.shares as number,
    price_usd:  r.price_usd as number,
    amount_usd: r.amount_usd as number,
    tx_date:    r.tx_date as string,
    notes:      r.notes as string,
    created_at: r.created_at as string,
  };
}

function toScenarioRun(r: Record<string, any>): ScenarioRun {
  return {
    id:          r.id as number,
    scenario_id: r.scenario_id as string,
    severity:    r.severity as string,
    result_json: r.result_json as string,
    run_at:      r.run_at as string,
  };
}

/** Execute a query and return typed rows */
async function query<T>(
  sql: string,
  args: any[],
  mapper: (r: Record<string, any>) => T,
): Promise<T[]> {
  const result = await db.execute({ sql, args });
  const cols = result.columns;
  return result.rows.map((row) => mapper(rowToObj(cols, row as any[])));
}

/** Execute a query and return first row or undefined */
async function queryOne<T>(
  sql: string,
  args: any[],
  mapper: (r: Record<string, any>) => T,
): Promise<T | undefined> {
  const rows = await query(sql, args, mapper);
  return rows[0];
}

/** Execute a write (INSERT/UPDATE/DELETE) */
async function exec(sql: string, args: any[]): Promise<void> {
  await db.execute({ sql, args });
}

// ── Storage interface ─────────────────────────────────────────────────────────

export interface IStorage {
  getAllHoldings(): Promise<Holding[]>;
  getHolding(id: number): Promise<Holding | undefined>;
  createHolding(holding: InsertHolding): Promise<Holding>;
  updateHolding(id: number, holding: Partial<InsertHolding>): Promise<Holding | undefined>;
  deleteHolding(id: number): Promise<void>;
  clearAndImport(holdingsList: InsertHolding[]): Promise<Holding[]>;
  countHoldings(): Promise<number>;

  getAllEnrichments(): Promise<Enrichment[]>;
  getEnrichment(ticker: string): Promise<Enrichment | undefined>;
  upsertEnrichment(data: InsertEnrichment): Promise<Enrichment>;

  getAllSnapshots(): Promise<Snapshot[]>;
  createSnapshot(data: InsertSnapshot): Promise<Snapshot>;

  getRelationshipGraph(tickerHash: string): Promise<RelationshipGraph | undefined>;
  upsertRelationshipGraph(data: InsertRelationshipGraph): Promise<RelationshipGraph>;

  getThesis(ticker: string): Promise<Thesis | undefined>;
  getAllTheses(): Promise<Thesis[]>;
  upsertThesis(data: InsertThesis): Promise<Thesis>;
  deleteThesis(ticker: string): Promise<void>;

  getDevilsAdvocate(ticker: string): Promise<DevilsAdvocate | undefined>;
  getAllDevilsAdvocates(): Promise<DevilsAdvocate[]>;
  upsertDevilsAdvocate(data: InsertDevilsAdvocate): Promise<DevilsAdvocate>;
  deleteDevilsAdvocate(ticker: string): Promise<void>;

  getWmbtItems(ticker: string): Promise<WmbtItem[]>;
  createWmbtItem(data: InsertWmbtItem): Promise<WmbtItem>;
  updateWmbtItem(id: number, data: Partial<InsertWmbtItem>): Promise<WmbtItem | undefined>;
  deleteWmbtItem(id: number): Promise<void>;

  getAllAlerts(): Promise<PriceAlert[]>;
  createAlert(data: InsertPriceAlert): Promise<PriceAlert>;
  deleteAlert(id: number): Promise<void>;
  getUntriggeredAlerts(): Promise<PriceAlert[]>;
  markAlertTriggered(id: number, triggeredAt: string): Promise<void>;

  // Watchlist
  getAllWatchlist(): Promise<WatchlistItem[]>;
  addToWatchlist(data: InsertWatchlist): Promise<WatchlistItem>;
  updateWatchlistItem(id: number, data: Partial<InsertWatchlist>): Promise<WatchlistItem | undefined>;
  deleteWatchlistItem(id: number): Promise<void>;

  // Milestones
  getAllMilestones(): Promise<Milestone[]>;
  createMilestone(data: InsertMilestone): Promise<Milestone>;
  updateMilestone(id: number, data: Partial<InsertMilestone>): Promise<Milestone | undefined>;
  deleteMilestone(id: number): Promise<void>;

  // Dividends
  getAllDividends(): Promise<DividendLog[]>;
  getDividendsByTicker(ticker: string): Promise<DividendLog[]>;
  createDividend(data: InsertDividendLog): Promise<DividendLog>;
  deleteDividend(id: number): Promise<void>;

  // Transactions
  getAllTransactions(): Promise<Transaction[]>;
  getTransactionsByTicker(ticker: string): Promise<Transaction[]>;
  createTransaction(data: InsertTransaction): Promise<Transaction>;
  deleteTransaction(id: number): Promise<void>;

  // Scenario runs
  saveScenarioRun(data: InsertScenarioRun): Promise<ScenarioRun>;
  getScenarioHistory(scenarioId: string): Promise<ScenarioRun[]>;
}

// ── Implementation ────────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {

  // ── Holdings ──────────────────────────────────────────────────────────────

  async getAllHoldings(): Promise<Holding[]> {
    return query("SELECT * FROM holdings ORDER BY id", [], toHolding);
  }

  async getHolding(id: number): Promise<Holding | undefined> {
    return queryOne("SELECT * FROM holdings WHERE id = ?", [id], toHolding);
  }

  async createHolding(h: InsertHolding): Promise<Holding> {
    const r = await db.execute({
      sql: `INSERT INTO holdings (ticker, shares, avg_cost, bdd_type, sector, notes)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [h.ticker, h.shares, h.avg_cost, h.bdd_type ?? "engine", h.sector ?? "", h.notes ?? ""],
    });
    return toHolding(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async updateHolding(id: number, h: Partial<InsertHolding>): Promise<Holding | undefined> {
    const existing = await this.getHolding(id);
    if (!existing) return undefined;
    const merged = { ...existing, ...h };
    const r = await db.execute({
      sql: `UPDATE holdings SET ticker=?, shares=?, avg_cost=?, bdd_type=?, sector=?, notes=?
            WHERE id=? RETURNING *`,
      args: [merged.ticker, merged.shares, merged.avg_cost, merged.bdd_type, merged.sector, merged.notes, id],
    });
    return toHolding(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async deleteHolding(id: number): Promise<void> {
    await exec("DELETE FROM holdings WHERE id = ?", [id]);
  }

  async clearAndImport(list: InsertHolding[]): Promise<Holding[]> {
    await exec("DELETE FROM holdings", []);
    const results: Holding[] = [];
    for (const h of list) {
      results.push(await this.createHolding(h));
    }
    return results;
  }

  async countHoldings(): Promise<number> {
    const r = await db.execute("SELECT COUNT(*) as n FROM holdings");
    return Number((r.rows[0] as any[])[0]);
  }

  // ── Enrichments ───────────────────────────────────────────────────────────

  async getAllEnrichments(): Promise<Enrichment[]> {
    return query("SELECT * FROM enrichments ORDER BY id", [], toEnrichment);
  }

  async getEnrichment(ticker: string): Promise<Enrichment | undefined> {
    return queryOne("SELECT * FROM enrichments WHERE ticker = ?", [ticker], toEnrichment);
  }

  async upsertEnrichment(d: InsertEnrichment): Promise<Enrichment> {
    const r = await db.execute({
      sql: `INSERT INTO enrichments (
              ticker, company_name, industry, market_cap, beta,
              pe_ratio, pb_ratio, ps_ratio, pfcf_ratio, ev_ebitda,
              roic, roe, gross_margin, operating_margin, net_margin,
              fcf_margin, revenue_growth_5y, eps_growth_5y, net_debt_ebitda,
              dividend_yield, eps_ttm, fcf_per_share, book_value_per_share,
              revenue_per_share, pe_5y_median, pb_5y_median, ps_5y_median,
              pfcf_5y_median, enriched_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(ticker) DO UPDATE SET
              company_name=excluded.company_name, industry=excluded.industry,
              market_cap=excluded.market_cap, beta=excluded.beta,
              pe_ratio=excluded.pe_ratio, pb_ratio=excluded.pb_ratio,
              ps_ratio=excluded.ps_ratio, pfcf_ratio=excluded.pfcf_ratio,
              ev_ebitda=excluded.ev_ebitda, roic=excluded.roic, roe=excluded.roe,
              gross_margin=excluded.gross_margin, operating_margin=excluded.operating_margin,
              net_margin=excluded.net_margin, fcf_margin=excluded.fcf_margin,
              revenue_growth_5y=excluded.revenue_growth_5y, eps_growth_5y=excluded.eps_growth_5y,
              net_debt_ebitda=excluded.net_debt_ebitda, dividend_yield=excluded.dividend_yield,
              eps_ttm=excluded.eps_ttm, fcf_per_share=excluded.fcf_per_share,
              book_value_per_share=excluded.book_value_per_share,
              revenue_per_share=excluded.revenue_per_share,
              pe_5y_median=excluded.pe_5y_median, pb_5y_median=excluded.pb_5y_median,
              ps_5y_median=excluded.ps_5y_median, pfcf_5y_median=excluded.pfcf_5y_median,
              enriched_at=excluded.enriched_at
            RETURNING *`,
      args: [
        d.ticker, d.company_name ?? null, d.industry ?? null, d.market_cap ?? null,
        d.beta ?? null, d.pe_ratio ?? null, d.pb_ratio ?? null, d.ps_ratio ?? null,
        d.pfcf_ratio ?? null, d.ev_ebitda ?? null, d.roic ?? null, d.roe ?? null,
        d.gross_margin ?? null, d.operating_margin ?? null, d.net_margin ?? null,
        d.fcf_margin ?? null, d.revenue_growth_5y ?? null, d.eps_growth_5y ?? null,
        d.net_debt_ebitda ?? null, d.dividend_yield ?? null, d.eps_ttm ?? null,
        d.fcf_per_share ?? null, d.book_value_per_share ?? null, d.revenue_per_share ?? null,
        d.pe_5y_median ?? null, d.pb_5y_median ?? null, d.ps_5y_median ?? null,
        d.pfcf_5y_median ?? null, d.enriched_at ?? null,
      ],
    });
    return toEnrichment(rowToObj(r.columns, r.rows[0] as any[]));
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  async getAllSnapshots(): Promise<Snapshot[]> {
    return query("SELECT * FROM snapshots ORDER BY date ASC", [], toSnapshot);
  }

  async createSnapshot(d: InsertSnapshot): Promise<Snapshot> {
    const r = await db.execute({
      sql: `INSERT INTO snapshots (date, total_value, total_cost, deposits, withdrawals)
            VALUES (?, ?, ?, ?, ?) RETURNING *`,
      args: [d.date, d.total_value, d.total_cost, d.deposits ?? 0, d.withdrawals ?? 0],
    });
    return toSnapshot(rowToObj(r.columns, r.rows[0] as any[]));
  }

  // ── Relationship Graphs ───────────────────────────────────────────────────

  async getRelationshipGraph(tickerHash: string): Promise<RelationshipGraph | undefined> {
    return queryOne(
      "SELECT * FROM relationship_graphs WHERE ticker_hash = ?",
      [tickerHash],
      toRelationshipGraph,
    );
  }

  async upsertRelationshipGraph(d: InsertRelationshipGraph): Promise<RelationshipGraph> {
    const r = await db.execute({
      sql: `INSERT INTO relationship_graphs (ticker_hash, result_json, computed_at)
            VALUES (?, ?, ?)
            ON CONFLICT(ticker_hash) DO UPDATE SET
              result_json=excluded.result_json, computed_at=excluded.computed_at
            RETURNING *`,
      args: [d.ticker_hash, d.result_json, d.computed_at],
    });
    return toRelationshipGraph(rowToObj(r.columns, r.rows[0] as any[]));
  }

  // ── Theses ────────────────────────────────────────────────────────────────

  async getThesis(ticker: string): Promise<Thesis | undefined> {
    return queryOne("SELECT * FROM theses WHERE ticker = ?", [ticker], toThesis);
  }

  async getAllTheses(): Promise<Thesis[]> {
    return query("SELECT * FROM theses ORDER BY id", [], toThesis);
  }

  async upsertThesis(d: InsertThesis): Promise<Thesis> {
    const r = await db.execute({
      sql: `INSERT INTO theses (ticker, summary, why_own, key_drivers, risks,
              break_conditions, what_must_be_true, valuation_view, generated_at, source)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(ticker) DO UPDATE SET
              summary=excluded.summary, why_own=excluded.why_own,
              key_drivers=excluded.key_drivers, risks=excluded.risks,
              break_conditions=excluded.break_conditions,
              what_must_be_true=excluded.what_must_be_true,
              valuation_view=excluded.valuation_view,
              generated_at=excluded.generated_at, source=excluded.source
            RETURNING *`,
      args: [
        d.ticker, d.summary, d.why_own, d.key_drivers, d.risks,
        d.break_conditions, d.what_must_be_true, d.valuation_view,
        d.generated_at, d.source ?? "ai",
      ],
    });
    return toThesis(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async deleteThesis(ticker: string): Promise<void> {
    await exec("DELETE FROM theses WHERE ticker = ?", [ticker]);
  }

  // ── Devils Advocates ──────────────────────────────────────────────────────

  async getDevilsAdvocate(ticker: string): Promise<DevilsAdvocate | undefined> {
    return queryOne("SELECT * FROM devils_advocates WHERE ticker = ?", [ticker], toDevilsAdvocate);
  }

  async getAllDevilsAdvocates(): Promise<DevilsAdvocate[]> {
    return query("SELECT * FROM devils_advocates ORDER BY id", [], toDevilsAdvocate);
  }

  async upsertDevilsAdvocate(d: InsertDevilsAdvocate): Promise<DevilsAdvocate> {
    const r = await db.execute({
      sql: `INSERT INTO devils_advocates (ticker, bear_headline, counter_arguments,
              blind_spots, worst_case_scenario, conviction_challenge, verdict, generated_at)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(ticker) DO UPDATE SET
              bear_headline=excluded.bear_headline,
              counter_arguments=excluded.counter_arguments,
              blind_spots=excluded.blind_spots,
              worst_case_scenario=excluded.worst_case_scenario,
              conviction_challenge=excluded.conviction_challenge,
              verdict=excluded.verdict, generated_at=excluded.generated_at
            RETURNING *`,
      args: [
        d.ticker, d.bear_headline, d.counter_arguments, d.blind_spots,
        d.worst_case_scenario, d.conviction_challenge, d.verdict, d.generated_at,
      ],
    });
    return toDevilsAdvocate(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async deleteDevilsAdvocate(ticker: string): Promise<void> {
    await exec("DELETE FROM devils_advocates WHERE ticker = ?", [ticker]);
  }

  // ── WMBT Items ────────────────────────────────────────────────────────────

  async getWmbtItems(ticker: string): Promise<WmbtItem[]> {
    return query("SELECT * FROM wmbt_items WHERE ticker = ? ORDER BY id", [ticker], toWmbtItem);
  }

  async createWmbtItem(d: InsertWmbtItem): Promise<WmbtItem> {
    const r = await db.execute({
      sql: `INSERT INTO wmbt_items (ticker, condition, status, notes, updated_at)
            VALUES (?, ?, ?, ?, ?) RETURNING *`,
      args: [d.ticker, d.condition, d.status ?? "unverified", d.notes ?? "", d.updated_at],
    });
    return toWmbtItem(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async updateWmbtItem(id: number, d: Partial<InsertWmbtItem>): Promise<WmbtItem | undefined> {
    const existing = await queryOne("SELECT * FROM wmbt_items WHERE id = ?", [id], toWmbtItem);
    if (!existing) return undefined;
    const merged = { ...existing, ...d };
    const r = await db.execute({
      sql: `UPDATE wmbt_items SET ticker=?, condition=?, status=?, notes=?, updated_at=?
            WHERE id=? RETURNING *`,
      args: [merged.ticker, merged.condition, merged.status, merged.notes, merged.updated_at, id],
    });
    return toWmbtItem(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async deleteWmbtItem(id: number): Promise<void> {
    await exec("DELETE FROM wmbt_items WHERE id = ?", [id]);
  }

  // ── Price Alerts ──────────────────────────────────────────────────────────

  async getAllAlerts(): Promise<PriceAlert[]> {
    return query("SELECT * FROM price_alerts ORDER BY created_at ASC", [], toPriceAlert);
  }

  async createAlert(d: InsertPriceAlert): Promise<PriceAlert> {
    const r = await db.execute({
      sql: `INSERT INTO price_alerts (ticker, alert_type, target_value, label, triggered, triggered_at, created_at)
            VALUES (?, ?, ?, ?, 0, NULL, ?) RETURNING *`,
      args: [d.ticker, d.alert_type, d.target_value, d.label ?? "", d.created_at],
    });
    return toPriceAlert(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async deleteAlert(id: number): Promise<void> {
    await exec("DELETE FROM price_alerts WHERE id = ?", [id]);
  }

  async getUntriggeredAlerts(): Promise<PriceAlert[]> {
    return query("SELECT * FROM price_alerts WHERE triggered = 0", [], toPriceAlert);
  }

  async markAlertTriggered(id: number, triggeredAt: string): Promise<void> {
    await exec(
      "UPDATE price_alerts SET triggered = 1, triggered_at = ? WHERE id = ?",
      [triggeredAt, id],
    );
  }

  // ── Watchlist ─────────────────────────────────────────────────────────────

  async getAllWatchlist(): Promise<WatchlistItem[]> {
    return query("SELECT * FROM watchlist ORDER BY id", [], toWatchlistItem);
  }

  async addToWatchlist(d: InsertWatchlist): Promise<WatchlistItem> {
    const r = await db.execute({
      sql: `INSERT INTO watchlist (ticker, buy_below, notes, sector, created_at)
            VALUES (?, ?, ?, ?, ?) RETURNING *`,
      args: [d.ticker, d.buy_below ?? null, d.notes ?? "", d.sector ?? "", d.created_at],
    });
    return toWatchlistItem(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async updateWatchlistItem(id: number, d: Partial<InsertWatchlist>): Promise<WatchlistItem | undefined> {
    const existing = await queryOne("SELECT * FROM watchlist WHERE id = ?", [id], toWatchlistItem);
    if (!existing) return undefined;
    const merged = { ...existing, ...d };
    const r = await db.execute({
      sql: `UPDATE watchlist SET ticker=?, buy_below=?, notes=?, sector=?
            WHERE id=? RETURNING *`,
      args: [merged.ticker, merged.buy_below ?? null, merged.notes, merged.sector, id],
    });
    return toWatchlistItem(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async deleteWatchlistItem(id: number): Promise<void> {
    await exec("DELETE FROM watchlist WHERE id = ?", [id]);
  }

  // ── Milestones ────────────────────────────────────────────────────────────

  async getAllMilestones(): Promise<Milestone[]> {
    return query("SELECT * FROM milestones ORDER BY id", [], toMilestone);
  }

  async createMilestone(d: InsertMilestone): Promise<Milestone> {
    const r = await db.execute({
      sql: `INSERT INTO milestones (label, target_value, target_date, notes, achieved, achieved_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [
        d.label, d.target_value, d.target_date ?? null,
        d.notes ?? "", d.achieved ? 1 : 0, d.achieved_at ?? null, d.created_at,
      ],
    });
    return toMilestone(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async updateMilestone(id: number, d: Partial<InsertMilestone>): Promise<Milestone | undefined> {
    const existing = await queryOne("SELECT * FROM milestones WHERE id = ?", [id], toMilestone);
    if (!existing) return undefined;
    const merged = { ...existing, ...d };
    const r = await db.execute({
      sql: `UPDATE milestones SET label=?, target_value=?, target_date=?, notes=?, achieved=?, achieved_at=?
            WHERE id=? RETURNING *`,
      args: [
        merged.label, merged.target_value, merged.target_date ?? null,
        merged.notes, merged.achieved ? 1 : 0, merged.achieved_at ?? null, id,
      ],
    });
    return toMilestone(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async deleteMilestone(id: number): Promise<void> {
    await exec("DELETE FROM milestones WHERE id = ?", [id]);
  }

  // ── Dividends Log ─────────────────────────────────────────────────────────

  async getAllDividends(): Promise<DividendLog[]> {
    return query("SELECT * FROM dividends_log ORDER BY received_date DESC", [], toDividendLog);
  }

  async getDividendsByTicker(ticker: string): Promise<DividendLog[]> {
    return query("SELECT * FROM dividends_log WHERE ticker = ? ORDER BY received_date DESC", [ticker], toDividendLog);
  }

  async createDividend(d: InsertDividendLog): Promise<DividendLog> {
    const r = await db.execute({
      sql: `INSERT INTO dividends_log (ticker, amount_usd, received_date, notes, created_at)
            VALUES (?, ?, ?, ?, ?) RETURNING *`,
      args: [d.ticker, d.amount_usd, d.received_date, d.notes ?? "", d.created_at],
    });
    return toDividendLog(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async deleteDividend(id: number): Promise<void> {
    await exec("DELETE FROM dividends_log WHERE id = ?", [id]);
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async getAllTransactions(): Promise<Transaction[]> {
    return query("SELECT * FROM transactions ORDER BY tx_date DESC", [], toTransaction);
  }

  async getTransactionsByTicker(ticker: string): Promise<Transaction[]> {
    return query("SELECT * FROM transactions WHERE ticker = ? ORDER BY tx_date DESC", [ticker], toTransaction);
  }

  async createTransaction(d: InsertTransaction): Promise<Transaction> {
    const r = await db.execute({
      sql: `INSERT INTO transactions (ticker, action, shares, price_usd, amount_usd, tx_date, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [
        d.ticker, d.action ?? "buy", d.shares, d.price_usd,
        d.amount_usd, d.tx_date, d.notes ?? "", d.created_at,
      ],
    });
    return toTransaction(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async deleteTransaction(id: number): Promise<void> {
    await exec("DELETE FROM transactions WHERE id = ?", [id]);
  }

  // ── Scenario Runs ─────────────────────────────────────────────────────────

  async saveScenarioRun(d: InsertScenarioRun): Promise<ScenarioRun> {
    const r = await db.execute({
      sql: `INSERT INTO scenario_runs (scenario_id, severity, result_json, run_at)
            VALUES (?, ?, ?, ?) RETURNING *`,
      args: [d.scenario_id, d.severity, d.result_json, d.run_at],
    });
    return toScenarioRun(rowToObj(r.columns, r.rows[0] as any[]));
  }

  async getScenarioHistory(scenarioId: string): Promise<ScenarioRun[]> {
    return query(
      "SELECT * FROM scenario_runs WHERE scenario_id = ? ORDER BY run_at DESC",
      [scenarioId],
      toScenarioRun,
    );
  }
}

export const storage = new DatabaseStorage();

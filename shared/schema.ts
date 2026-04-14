import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const holdings = sqliteTable("holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  shares: real("shares").notNull(),
  avg_cost: real("avg_cost").notNull(),
  bdd_type: text("bdd_type").notNull().default("engine"),
  sector: text("sector").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

export const enrichments = sqliteTable("enrichments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull().unique(),
  company_name: text("company_name"),
  industry: text("industry"),
  market_cap: real("market_cap"),
  beta: real("beta"),
  pe_ratio: real("pe_ratio"),
  pb_ratio: real("pb_ratio"),
  ps_ratio: real("ps_ratio"),
  pfcf_ratio: real("pfcf_ratio"),
  ev_ebitda: real("ev_ebitda"),
  roic: real("roic"),
  roe: real("roe"),
  gross_margin: real("gross_margin"),
  operating_margin: real("operating_margin"),
  net_margin: real("net_margin"),
  fcf_margin: real("fcf_margin"),
  revenue_growth_5y: real("revenue_growth_5y"),
  eps_growth_5y: real("eps_growth_5y"),
  net_debt_ebitda: real("net_debt_ebitda"),
  dividend_yield: real("dividend_yield"),
  eps_ttm: real("eps_ttm"),
  fcf_per_share: real("fcf_per_share"),
  book_value_per_share: real("book_value_per_share"),
  revenue_per_share: real("revenue_per_share"),
  pe_5y_median: real("pe_5y_median"),
  pb_5y_median: real("pb_5y_median"),
  ps_5y_median: real("ps_5y_median"),
  pfcf_5y_median: real("pfcf_5y_median"),
  enriched_at: text("enriched_at"),
});

export const snapshots = sqliteTable("snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  total_value: real("total_value").notNull(),
  total_cost: real("total_cost").notNull(),
  deposits: real("deposits").default(0),
  withdrawals: real("withdrawals").default(0),
});

export const relationshipGraphs = sqliteTable("relationship_graphs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker_hash: text("ticker_hash").notNull().unique(),
  result_json: text("result_json").notNull(),
  computed_at: text("computed_at").notNull(),
});

export const theses = sqliteTable("theses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull().unique(),
  summary: text("summary").notNull(),
  why_own: text("why_own").notNull(),
  key_drivers: text("key_drivers").notNull(),
  risks: text("risks").notNull(),
  break_conditions: text("break_conditions").notNull(),
  what_must_be_true: text("what_must_be_true").notNull(),
  valuation_view: text("valuation_view").notNull(),
  generated_at: text("generated_at").notNull(),
  source: text("source").notNull().default("ai"),
});

export const devils_advocates = sqliteTable("devils_advocates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull().unique(),
  bear_headline: text("bear_headline").notNull(),
  counter_arguments: text("counter_arguments").notNull(),
  blind_spots: text("blind_spots").notNull(),
  worst_case_scenario: text("worst_case_scenario").notNull(),
  conviction_challenge: text("conviction_challenge").notNull(),
  verdict: text("verdict").notNull(),
  generated_at: text("generated_at").notNull(),
});

export const wmbt_items = sqliteTable("wmbt_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  condition: text("condition").notNull(),
  status: text("status").notNull().default("unverified"),
  notes: text("notes").notNull().default(""),
  updated_at: text("updated_at").notNull(),
});

export const price_alerts = sqliteTable("price_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  alert_type: text("alert_type").notNull(),
  target_value: real("target_value").notNull(),
  label: text("label").notNull().default(""),
  triggered: integer("triggered", { mode: "boolean" }).notNull().default(false),
  triggered_at: text("triggered_at"),
  created_at: text("created_at").notNull(),
});

export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  buy_below: real("buy_below"),
  notes: text("notes").notNull().default(""),
  sector: text("sector").notNull().default(""),
  created_at: text("created_at").notNull(),
});

export const milestones = sqliteTable("milestones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  target_value: real("target_value").notNull(),
  target_date: text("target_date"),
  notes: text("notes").notNull().default(""),
  achieved: integer("achieved", { mode: "boolean" }).notNull().default(false),
  achieved_at: text("achieved_at"),
  created_at: text("created_at").notNull(),
});

export const dividends_log = sqliteTable("dividends_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  amount_usd: real("amount_usd").notNull(),
  received_date: text("received_date").notNull(),
  notes: text("notes").notNull().default(""),
  created_at: text("created_at").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  action: text("action").notNull().default("buy"),
  shares: real("shares").notNull(),
  price_usd: real("price_usd").notNull(),
  amount_usd: real("amount_usd").notNull(),
  tx_date: text("tx_date").notNull(),
  notes: text("notes").notNull().default(""),
  created_at: text("created_at").notNull(),
});

export const scenario_runs = sqliteTable("scenario_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scenario_id: text("scenario_id").notNull(),
  severity: text("severity").notNull(),
  result_json: text("result_json").notNull(),
  run_at: text("run_at").notNull(),
});

// Insert schemas
export const insertWatchlistSchema = createInsertSchema(watchlist).omit({ id: true });
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true });
export const insertDividendLogSchema = createInsertSchema(dividends_log).omit({ id: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true });
export const insertScenarioRunSchema = createInsertSchema(scenario_runs).omit({ id: true });

// Types
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type WatchlistItem = typeof watchlist.$inferSelect;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Milestone = typeof milestones.$inferSelect;
export type InsertDividendLog = z.infer<typeof insertDividendLogSchema>;
export type DividendLog = typeof dividends_log.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertScenarioRun = z.infer<typeof insertScenarioRunSchema>;
export type ScenarioRun = typeof scenario_runs.$inferSelect;

export const insertHoldingSchema = createInsertSchema(holdings).omit({ id: true });
export const insertEnrichmentSchema = createInsertSchema(enrichments).omit({ id: true });
export const insertSnapshotSchema = createInsertSchema(snapshots).omit({ id: true });
export const insertRelationshipGraphSchema = createInsertSchema(relationshipGraphs).omit({ id: true });
export const insertThesisSchema = createInsertSchema(theses).omit({ id: true });
export const insertDevilsAdvocateSchema = createInsertSchema(devils_advocates).omit({ id: true });
export const insertWmbtItemSchema = createInsertSchema(wmbt_items).omit({ id: true });
export const insertPriceAlertSchema = createInsertSchema(price_alerts).omit({ id: true });

export type InsertHolding = z.infer<typeof insertHoldingSchema>;
export type Holding = typeof holdings.$inferSelect;
export type InsertEnrichment = z.infer<typeof insertEnrichmentSchema>;
export type Enrichment = typeof enrichments.$inferSelect;
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type Snapshot = typeof snapshots.$inferSelect;
export type InsertRelationshipGraph = z.infer<typeof insertRelationshipGraphSchema>;
export type RelationshipGraph = typeof relationshipGraphs.$inferSelect;
export type InsertThesis = z.infer<typeof insertThesisSchema>;
export type Thesis = typeof theses.$inferSelect;
export type InsertDevilsAdvocate = z.infer<typeof insertDevilsAdvocateSchema>;
export type DevilsAdvocate = typeof devils_advocates.$inferSelect;
export type InsertWmbtItem = z.infer<typeof insertWmbtItemSchema>;
export type WmbtItem = typeof wmbt_items.$inferSelect;
export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;
export type PriceAlert = typeof price_alerts.$inferSelect;

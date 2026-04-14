/**
 * Scenario Library — all 26 scenarios across 3 waves
 * Grounded in official regulatory publications:
 * Fed 2025 Severely Adverse, BoE 2025 Capital Stress Test,
 * EBA/ECB/ESRB 2025 EU-wide stress test, IMF GFSR Apr 2025,
 * MSCI inflation & COVID scenario tables.
 *
 * Architecture rule: deterministic, no LLM, no FMP.
 */

export type ScenarioType =
  | "macro_path"
  | "factor_shock"
  | "historical_template"
  | "portfolio_specific";

export type SeverityLevel = "low" | "medium" | "high";

export interface ShockSet {
  equity_us?: number;       // pct decimal, e.g. -0.50
  equity_eu?: number;
  equity_uk?: number;
  equity_tech?: number;     // additional tech overlay
  rates_10y_delta?: number; // in percentage points
  rates_3m_delta?: number;
  credit_ig_bps?: number;   // bps widening
  credit_hy_bps?: number;
  fx_usd_pct?: number;      // positive = USD strengthens
  oil_pct?: number;
  gas_pct?: number;
  vix_level?: number;
  real_estate_us_pct?: number;
  real_estate_eu_pct?: number;
  dividend_cut_pct?: number;
}

export interface ScenarioShocks {
  low: ShockSet;
  medium: ShockSet;
  high: ShockSet;
}

export interface Scenario {
  id: string;
  wave: 1 | 2 | 3;
  type: ScenarioType;
  name: string;
  tagline: string;                  // 1-line summary for card
  narrative: string;                // 2–3 sentence description
  source: string;                   // authoritative source name
  source_date: string;
  confidence: "high" | "medium";
  horizon_label: string;            // e.g. "Instantaneous" | "9–13 quarters"
  watch_list: string[];             // "Watch: ..." items
  shocks: ScenarioShocks;
  education_note: string;           // what this scenario teaches
}

// ─── Helper: scale shocks ─────────────────────────────────────────────────────
export function scaledShocks(base: ShockSet, factor: number): ShockSet {
  const out: ShockSet = {};
  for (const k of Object.keys(base) as (keyof ShockSet)[]) {
    const v = base[k];
    if (v != null) {
      // VIX and spread levels: use factor directly
      (out as any)[k] = k === "vix_level" ? v * factor : v * factor;
    }
  }
  return out;
}

// ─── Scenario Library ─────────────────────────────────────────────────────────

export const SCENARIO_LIBRARY: Scenario[] = [
  // ════════════════════════ WAVE 1 — MUST-HAVE ════════════════════════════════

  {
    id: "FED25_SA_MACRO",
    wave: 1,
    type: "macro_path",
    name: "Fed Severely Adverse",
    tagline: "Equity −50%, VIX 65, housing −33%",
    narrative:
      "A severe global recession with sharp risk asset repricing. US unemployment peaks at 10%, real GDP declines 7.8%, and equity markets drop 50%. Published by the Federal Reserve as part of its 2025 supervisory stress tests.",
    source: "Federal Reserve 2025 Stress Test Scenarios",
    source_date: "2025-02-05",
    confidence: "high",
    horizon_label: "9–13 quarters (macro path)",
    watch_list: ["credit spreads +BBB stress", "housing drawdown", "income cuts"],
    shocks: {
      low: {
        equity_us: -0.35, rates_10y_delta: -2.3, credit_ig_bps: 273, credit_hy_bps: 800,
        vix_level: 45, real_estate_us_pct: -0.23, dividend_cut_pct: -0.15,
      },
      medium: {
        equity_us: -0.50, rates_10y_delta: -3.3, credit_ig_bps: 390, credit_hy_bps: 1200,
        vix_level: 65, real_estate_us_pct: -0.33, real_estate_eu_pct: -0.20,
        dividend_cut_pct: -0.21,
      },
      high: {
        equity_us: -0.60, rates_10y_delta: -3.96, credit_ig_bps: 468, credit_hy_bps: 1440,
        vix_level: 78, real_estate_us_pct: -0.40, real_estate_eu_pct: -0.28,
        dividend_cut_pct: -0.30,
      },
    },
    education_note:
      "The Federal Reserve requires large banks to show they can survive this scenario. It represents what happened in 2008-2009, scaled to today's conditions — a useful anchor for how extreme recessions affect portfolios.",
  },

  {
    id: "FED25_GMS_INSTANT",
    wave: 1,
    type: "factor_shock",
    name: "Fed Global Market Shock",
    tagline: "Instantaneous cross-asset factor hit",
    narrative:
      "An instantaneous repricing across all major asset classes — equities, rates, credit, FX, and commodities — based on the Fed's 2025 Global Market Shock tables used for trading book stress testing.",
    source: "Federal Reserve 2025 Global Market Shock tables",
    source_date: "2025-02-05",
    confidence: "high",
    horizon_label: "Instantaneous (T+0)",
    watch_list: ["top 5 risk drivers", "largest drawdown sleeve", "correlated exposures"],
    shocks: {
      low: {
        equity_us: -0.25, equity_eu: -0.22, rates_10y_delta: -1.65, credit_ig_bps: 195,
        credit_hy_bps: 600, fx_usd_pct: 0.05, oil_pct: 0.285, vix_level: 32,
      },
      medium: {
        equity_us: -0.35, equity_eu: -0.30, rates_10y_delta: -2.2, credit_ig_bps: 300,
        credit_hy_bps: 900, fx_usd_pct: 0.08, oil_pct: 0.40, vix_level: 45,
      },
      high: {
        equity_us: -0.45, equity_eu: -0.40, rates_10y_delta: -2.75, credit_ig_bps: 375,
        credit_hy_bps: 1125, fx_usd_pct: 0.10, oil_pct: 0.50, vix_level: 56,
      },
    },
    education_note:
      "This is how regulators test trading desks: one simultaneous shock to every asset class. Your portfolio likely has hidden correlations that only become visible when everything moves at once.",
  },

  {
    id: "BOE25_SUPPLY_SHOCK",
    wave: 1,
    type: "macro_path",
    name: "BoE Supply Shock",
    tagline: "Rates spike + equity −50% + energy shock",
    narrative:
      "A severe global supply shock driven by trade fragmentation and energy price spikes. UK Bank Rate peaks at 8%, equities fall 50-57%, oil surges over 100%, gas over 300%. From the Bank of England 2025 Bank Capital Stress Test.",
    source: "Bank of England 2025 Bank Capital Stress Test",
    source_date: "2025-03-01",
    confidence: "high",
    horizon_label: "5-year stress horizon",
    watch_list: ["mortgage costs + credit spreads", "energy-sensitive holdings", "duration exposure"],
    shocks: {
      low: {
        equity_us: -0.43, equity_uk: -0.36, rates_10y_delta: 3.2, credit_ig_bps: 375,
        credit_hy_bps: 1725, oil_pct: 0.75, gas_pct: 2.25, vix_level: 34,
        real_estate_us_pct: -0.20, real_estate_eu_pct: -0.15,
      },
      medium: {
        equity_us: -0.57, equity_uk: -0.48, rates_10y_delta: 4.27, credit_ig_bps: 500,
        credit_hy_bps: 2300, oil_pct: 1.0, gas_pct: 3.0, vix_level: 45,
        real_estate_us_pct: -0.28, real_estate_eu_pct: -0.20,
      },
      high: {
        equity_us: -0.71, equity_uk: -0.60, rates_10y_delta: 5.34, credit_ig_bps: 625,
        credit_hy_bps: 2875, oil_pct: 1.25, gas_pct: 3.75, vix_level: 56,
        real_estate_us_pct: -0.35, real_estate_eu_pct: -0.25,
      },
    },
    education_note:
      "Supply shocks are different from demand shocks: they cause both inflation AND recession simultaneously. This is the stagflation scenario. The BoE uses this to test whether banks can survive a world of high rates AND falling assets.",
  },

  {
    id: "EBA25_ADVERSE",
    wave: 1,
    type: "macro_path",
    name: "EBA EU Adverse",
    tagline: "EU equities −50% + oil spike + credit blowout",
    narrative:
      "An EU recession driven by geopolitics, trade disruption, and energy/commodity surge. EU equities fall 50%, iTraxx credit indices blow out, and real estate drops 15–20%. EBA/ECB/ESRB 2025 EU-wide stress test scenario.",
    source: "EBA/ECB/ESRB 2025 EU-wide Stress Test Macro-financial Scenario",
    source_date: "2025-01-01",
    confidence: "high",
    horizon_label: "3-year (2025–2027)",
    watch_list: ["EU property + credit sleeves", "EUR currency exposure", "commodity-sensitive holdings"],
    shocks: {
      low: {
        equity_us: -0.49, equity_eu: -0.40, rates_10y_delta: 0.5, credit_ig_bps: 148,
        credit_hy_bps: 304, oil_pct: 0.457, gas_pct: 0.523, vix_level: 28,
        real_estate_eu_pct: -0.125,
      },
      medium: {
        equity_us: -0.61, equity_eu: -0.50, rates_10y_delta: 0.8, credit_ig_bps: 184,
        credit_hy_bps: 379, oil_pct: 0.571, gas_pct: 0.653, vix_level: 35,
        real_estate_eu_pct: -0.157,
      },
      high: {
        equity_us: -0.73, equity_eu: -0.60, rates_10y_delta: 1.0, credit_ig_bps: 221,
        credit_hy_bps: 455, oil_pct: 0.686, gas_pct: 0.784, vix_level: 42,
        real_estate_eu_pct: -0.188,
      },
    },
    education_note:
      "European regulatory stress tests focus on sovereign debt, banking sector interconnection, and commodity dependence. For a US-focused investor, this scenario tests whether your non-US holdings and FX exposure add resilience or concentration.",
  },

  {
    id: "DIVIDEND_INCOME_CUT",
    wave: 1,
    type: "portfolio_specific",
    name: "Dividend Income Cut",
    tagline: "Dividends −25% test — income plan stress",
    narrative:
      "Dividend cuts and suspensions hit your income plan. In 2009, S&P 500 dividends fell 21.07%. This scenario applies a configurable cut across your dividend streams to show income dependency risk.",
    source: "S&P Dow Jones Indices dividend history (2009 reference: −21.07%)",
    source_date: "2025-01-01",
    confidence: "high",
    horizon_label: "12 months",
    watch_list: ["top 3 income sources", "runway in months", "dividend concentration"],
    shocks: {
      low: { dividend_cut_pct: -0.10, equity_us: -0.10 },
      medium: { dividend_cut_pct: -0.25, equity_us: -0.20 },
      high: { dividend_cut_pct: -0.40, equity_us: -0.35 },
    },
    education_note:
      "Many investors underestimate dividend risk. During the GFC, companies that looked safe cut dividends without warning. Yield-on-cost is only meaningful if the dividend is sustainable. This scenario shows how dependent your income plan really is.",
  },

  {
    id: "RATE_SHOCK_UP",
    wave: 1,
    type: "factor_shock",
    name: "Rate Shock — Higher",
    tagline: "+200 bps — test duration + refinancing",
    narrative:
      "A 'higher for longer' repricing forces a parallel shift up in government bond yields. Based on BoE market stress peaks (US 10Y to 6.4%) and MSCI overheating scenario (+62 bps).",
    source: "BoE 2025 market stress peaks + MSCI Overheating inflation scenario",
    source_date: "2025-03-01",
    confidence: "medium",
    horizon_label: "Instantaneous to 6-month ramp",
    watch_list: ["bond duration", "floating-rate debt exposure", "refinancing risk"],
    shocks: {
      low: { rates_10y_delta: 1.0, credit_ig_bps: 50, equity_us: -0.05 },
      medium: { rates_10y_delta: 2.0, credit_ig_bps: 150, equity_us: -0.10 },
      high: { rates_10y_delta: 3.0, credit_ig_bps: 300, equity_us: -0.20 },
    },
    education_note:
      "Duration measures how sensitive a bond or bond-like asset is to rate changes. A 1% rate rise causes roughly a 7-year-duration bond to lose 7% of value. This scenario shows how your portfolio's interest-rate sensitivity works.",
  },

  {
    id: "RATE_SHOCK_DOWN",
    wave: 1,
    type: "factor_shock",
    name: "Rate Shock — Lower",
    tagline: "10Y −330 bps — flight to quality",
    narrative:
      "A flight-to-quality recession drives rates sharply lower. Based on Fed Severely Adverse: 10Y Treasury falls 330 bps to 1.0%, 3-month falls to near zero.",
    source: "Federal Reserve 2025 Severely Adverse macro path",
    source_date: "2025-02-05",
    confidence: "high",
    horizon_label: "3–6 months",
    watch_list: ["equity drawdown vs bond hedge benefit", "income reinvestment risk"],
    shocks: {
      low: { rates_10y_delta: -1.0, equity_us: -0.10 },
      medium: { rates_10y_delta: -2.0, equity_us: -0.25 },
      high: { rates_10y_delta: -3.3, equity_us: -0.50 },
    },
    education_note:
      "Falling rates are often a recession signal — good for existing bonds (their value rises) but usually accompanied by equity drawdowns. This is why bonds have historically hedged equity risk: they move in opposite directions during crises.",
  },

  {
    id: "CREDIT_SPREAD_BLOWOUT",
    wave: 1,
    type: "factor_shock",
    name: "Credit Spread Blowout",
    tagline: "IG +300 bps, HY +900 bps",
    narrative:
      "Credit markets reprice across the board. Investment-grade spreads widen to BoE stress peaks (500 bps), high-yield to 2,300 bps. This shows refinancing risk and marks credit-heavy holdings down sharply.",
    source: "BoE 2025 stress peaks + EBA iTraxx + Fed BBB spread",
    source_date: "2025-03-01",
    confidence: "high",
    horizon_label: "Instantaneous",
    watch_list: ["refinancing walls", "weakest credits in portfolio", "income from credit"],
    shocks: {
      low: { credit_ig_bps: 150, credit_hy_bps: 400, equity_us: -0.08 },
      medium: { credit_ig_bps: 300, credit_hy_bps: 900, equity_us: -0.15 },
      high: { credit_ig_bps: 500, credit_hy_bps: 2300, equity_us: -0.25 },
    },
    education_note:
      "Credit spreads are the premium lenders demand above government bonds to compensate for default risk. When they widen, it means the market is pricing in more risk of corporate failure. This shows up as losses in bond funds and pressures on equity valuations.",
  },

  {
    id: "USD_STRENGTH_FX_STRESS",
    wave: 1,
    type: "factor_shock",
    name: "USD Strength / FX Stress",
    tagline: "USD +10% — foreign asset translation loss",
    narrative:
      "A risk-off USD strengthening event. IMF GFSR uses USD +10% as a published shock. As a THB-base investor holding USD assets, this creates a translation gain — but models the scenario for USD-base investors and EM sensitivity.",
    source: "IMF GFSR Apr 2025 (Figure 1.13) + EBA FX table",
    source_date: "2025-04-01",
    confidence: "medium",
    horizon_label: "Instantaneous",
    watch_list: ["foreign equity translation", "USD-debt exposures", "THB/USD sensitivity"],
    shocks: {
      low: { fx_usd_pct: 0.05, equity_us: -0.05 },
      medium: { fx_usd_pct: 0.10, equity_us: -0.15 },
      high: { fx_usd_pct: 0.15, equity_us: -0.25 },
    },
    education_note:
      "For a Thai investor holding US stocks, USD strengthening is actually beneficial — your USD assets are worth more in THB terms. This scenario shows the FX component of your returns is a real driver, separate from stock price movement.",
  },

  {
    id: "COMMODITY_SPIKE",
    wave: 1,
    type: "factor_shock",
    name: "Commodity / Energy Spike",
    tagline: "Oil +60%, gas +100% — margin squeeze test",
    narrative:
      "Energy prices surge — oil rises 60-100%+, gas 100-300%+. Based on BoE stress (oil >100%, gas >300%) and EBA (oil +57%, gas +65%). This pressures margins of consumer and industrial companies.",
    source: "BoE 2025 stress + EBA 2025 commodity table",
    source_date: "2025-03-01",
    confidence: "high",
    horizon_label: "3–12 months",
    watch_list: ["input-cost sensitive holdings", "consumer discretionary", "transportation & logistics"],
    shocks: {
      low: { oil_pct: 0.30, gas_pct: 0.50, equity_us: -0.05 },
      medium: { oil_pct: 0.60, gas_pct: 1.00, equity_us: -0.10 },
      high: { oil_pct: 1.00, gas_pct: 3.00, equity_us: -0.20 },
    },
    education_note:
      "Energy prices affect almost every company through input costs, shipping, and consumer spending power. Energy companies benefit while airlines, retailers, and manufacturers suffer. This scenario reveals your portfolio's net energy sensitivity.",
  },

  {
    id: "VOLATILITY_SPIKE",
    wave: 1,
    type: "factor_shock",
    name: "Volatility Spike",
    tagline: "VIX 45–65 — fragility test",
    narrative:
      "A volatility surge causing correlations to rise and risk-parity strategies to unwind. Fed scenario uses VIX 65, BoE uses 45. Historical peaks: 80.86 (2008) and 82.69 (2020).",
    source: "Fed 2025 VIX 65 + BoE 2025 VIX 45 + St. Louis Fed FRED historical peaks",
    source_date: "2025-03-01",
    confidence: "high",
    horizon_label: "Instantaneous",
    watch_list: ["concentrated themes", "leverage exposure", "drawdown accelerants"],
    shocks: {
      low: { vix_level: 35, equity_us: -0.12 },
      medium: { vix_level: 45, equity_us: -0.20 },
      high: { vix_level: 65, equity_us: -0.35 },
    },
    education_note:
      "VIX measures how much volatility options traders expect over the next 30 days. When VIX spikes, it usually means correlations rise (assets that normally move independently start falling together), and leverage becomes dangerous.",
  },

  {
    id: "PROPERTY_STRESS",
    wave: 1,
    type: "factor_shock",
    name: "Real Estate Stress",
    tagline: "Housing −20% to −33% by region",
    narrative:
      "Real estate drawdown across regions. Fed: US housing −33%, CRE −30%. EBA: EU residential −15.7%, CRE −19.5%. BoE: UK housing −28%, CRE −35%.",
    source: "Fed 2025 Severely Adverse + EBA 2025 EU Adverse + BoE 2025 stress",
    source_date: "2025-03-01",
    confidence: "high",
    horizon_label: "2–5 years",
    watch_list: ["LTV/leverage", "refinance risk", "net worth impact"],
    shocks: {
      low: { real_estate_us_pct: -0.157, real_estate_eu_pct: -0.10, equity_us: -0.15 },
      medium: { real_estate_us_pct: -0.28, real_estate_eu_pct: -0.157, equity_us: -0.25 },
      high: { real_estate_us_pct: -0.40, real_estate_eu_pct: -0.25, equity_us: -0.35 },
    },
    education_note:
      "Real estate is often the largest asset for families. Unlike stocks, it's illiquid — you can't sell 10% of your house. This scenario shows how a property drawdown affects net worth and whether leverage (mortgages) amplifies the loss.",
  },

  // ════════════════════════ WAVE 2 — EXPANSION ════════════════════════════════

  {
    id: "GFC_2007_2009",
    wave: 2,
    type: "historical_template",
    name: "Global Financial Crisis",
    tagline: "S&P −57%, housing −30%, VIX 80.9",
    narrative:
      "The 2007–2009 banking crisis. S&P 500 fell 57% peak-to-trough, US housing −30%, VIX peaked at 80.86 on November 20, 2008, and S&P dividends fell 21% in 2009.",
    source: "FedHistory Great Recession + St. Louis Fed FRED VIX + S&P DJI dividend history",
    source_date: "2025-01-01",
    confidence: "medium",
    horizon_label: "Peak-to-trough block (~18 months)",
    watch_list: ["credit + income cuts", "financial sector holdings", "concentrated positions"],
    shocks: {
      low: { equity_us: -0.35, real_estate_us_pct: -0.15, credit_hy_bps: 1200, vix_level: 50, dividend_cut_pct: -0.12 },
      medium: { equity_us: -0.57, real_estate_us_pct: -0.30, credit_hy_bps: 2182, vix_level: 80, dividend_cut_pct: -0.21 },
      high: { equity_us: -0.65, real_estate_us_pct: -0.35, credit_hy_bps: 2500, vix_level: 90, dividend_cut_pct: -0.30 },
    },
    education_note:
      "The GFC is the benchmark for modern financial stress. Banks were over-leveraged, real estate was in a bubble, and complexity hid risk. Your portfolio likely didn't exist yet — this simulation shows what you would have experienced.",
  },

  {
    id: "COVID_2020_SHOCK",
    wave: 2,
    type: "historical_template",
    name: "COVID-19 Crash",
    tagline: "S&P −34% in 33 days, VIX 82.7",
    narrative:
      "The fastest bear market in history. S&P 500 fell 34% from Feb 19 to March 23, 2020. VIX peaked at 82.69 on March 16. The recovery was equally dramatic — V-shaped within 5 months.",
    source: "NY Fed Liberty Street Economics + St. Louis Fed FRED VIX peak",
    source_date: "2025-01-01",
    confidence: "high",
    horizon_label: "1–3 month shock + 6–12 month recovery",
    watch_list: ["liquidity", "forced selling risk", "recovery vs thesis"],
    shocks: {
      low: { equity_us: -0.20, vix_level: 50, credit_ig_bps: 200, oil_pct: -0.50 },
      medium: { equity_us: -0.34, vix_level: 82, credit_ig_bps: 350, oil_pct: -0.65 },
      high: { equity_us: -0.45, vix_level: 90, credit_ig_bps: 500, oil_pct: -0.80 },
    },
    education_note:
      "COVID showed that extreme speed is its own form of risk. Many investors sold at the bottom because they couldn't handle the pace of decline. The V-shaped recovery rewarded those who held — but nobody knew it would be V-shaped in real time.",
  },

  {
    id: "MSCI_INFL_OVERHEAT",
    wave: 2,
    type: "factor_shock",
    name: "Overheating Inflation",
    tagline: "10Y +62 bps, equities −11%",
    narrative:
      "Demand-driven inflation scenario from MSCI's inflation regime analysis. Breakevens rise, yields up, equities down moderately. 10Y UST +62 bps, US equities −11.2%, EUR/USD −2.1%.",
    source: "MSCI Inflation Scenarios (Overheating) — explicit parameter table",
    source_date: "2025-01-01",
    confidence: "high",
    horizon_label: "Instantaneous to 3-month step",
    watch_list: ["duration exposure", "refinancing risk", "real asset positions"],
    shocks: {
      low: { rates_10y_delta: 0.37, equity_us: -0.067, credit_ig_bps: 60, fx_usd_pct: 0.013 },
      medium: { rates_10y_delta: 0.62, equity_us: -0.112, credit_ig_bps: 90, fx_usd_pct: 0.021 },
      high: { rates_10y_delta: 0.87, equity_us: -0.157, credit_ig_bps: 126, fx_usd_pct: 0.029 },
    },
    education_note:
      "Overheating inflation comes from too much demand, not supply problems. The Fed raises rates to cool it down. This hurts bond prices and growth stocks most, while commodity producers and banks often benefit.",
  },

  {
    id: "MSCI_STAGFLATION",
    wave: 2,
    type: "factor_shock",
    name: "Stagflation",
    tagline: "Equities −18%, spreads widen, USD stronger",
    narrative:
      "Supply-driven inflation hits growth simultaneously. MSCI Stagflation scenario: 10Y UST +36 bps, US equities −18.3%, EUR/USD −4.2%, credit spreads +20% multiplier.",
    source: "MSCI Inflation Scenarios (Stagflation) — explicit parameter table",
    source_date: "2025-01-01",
    confidence: "high",
    horizon_label: "Instantaneous to 3-month step",
    watch_list: ["input-cost sensitive holdings", "consumer discretionary", "growth sleeves"],
    shocks: {
      low: { rates_10y_delta: 0.22, equity_us: -0.11, credit_ig_bps: 80, fx_usd_pct: 0.025 },
      medium: { rates_10y_delta: 0.36, equity_us: -0.183, credit_ig_bps: 120, fx_usd_pct: 0.042 },
      high: { rates_10y_delta: 0.50, equity_us: -0.256, credit_ig_bps: 168, fx_usd_pct: 0.059 },
    },
    education_note:
      "Stagflation is the hardest scenario for a central bank: you can't cut rates to help growth because inflation is already high, and you can't raise rates without deepening the recession. The 1970s are the main historical example.",
  },

  {
    id: "MSCI_DEFLATION",
    wave: 2,
    type: "factor_shock",
    name: "Deflationary Bust",
    tagline: "Equities −22%, yields down, spreads widen",
    narrative:
      "A demand crash drives deflation — falling prices and falling asset values simultaneously. MSCI: 10Y UST −32 bps, US equities −22.3%, credit spreads +32% multiplier, EUR/USD +1.4%.",
    source: "MSCI Inflation Scenarios (Deflationary Bust) — explicit parameter table",
    source_date: "2025-01-01",
    confidence: "high",
    horizon_label: "Instantaneous to 3-month step",
    watch_list: ["credit + cyclical sleeves", "debt-heavy companies", "pricing power holdings"],
    shocks: {
      low: { rates_10y_delta: -0.19, equity_us: -0.134, credit_ig_bps: 100, fx_usd_pct: -0.008 },
      medium: { rates_10y_delta: -0.32, equity_us: -0.223, credit_ig_bps: 150, fx_usd_pct: -0.014 },
      high: { rates_10y_delta: -0.45, equity_us: -0.312, credit_ig_bps: 198, fx_usd_pct: -0.020 },
    },
    education_note:
      "Deflation is rare in modern economies but powerful when it hits. Japan experienced two 'lost decades' of deflation. Companies can't raise prices, debt becomes harder to repay, and the economy stagnates. Quality companies with pricing power are the key defensive asset.",
  },

  {
    id: "MSCI_COVID_VSHAPE",
    wave: 2,
    type: "historical_template",
    name: "COVID V-Shape Recovery",
    tagline: "Equity −13%, fast containment + rebound",
    narrative:
      "MSCI's best-case COVID scenario: fast containment with V-shaped recovery. IG spread shock +120 bps, HY +250 bps, oil $55, implied equity return −13% vs Feb 2020 peak.",
    source: "MSCI COVID-19 Scenarios (V-shape)",
    source_date: "2025-01-01",
    confidence: "high",
    horizon_label: "6–12 month path",
    watch_list: ["recovery pace vs thesis", "credit spreads normalizing"],
    shocks: {
      low: { equity_us: -0.08, credit_ig_bps: 72, credit_hy_bps: 150, oil_pct: -0.25 },
      medium: { equity_us: -0.13, credit_ig_bps: 120, credit_hy_bps: 250, oil_pct: -0.40 },
      high: { equity_us: -0.20, credit_ig_bps: 168, credit_hy_bps: 350, oil_pct: -0.55 },
    },
    education_note:
      "The V-shape COVID outcome was not obvious in March 2020. Investors who anticipated it and held were rewarded. But scenario planning isn't about predicting which shape happens — it's about knowing how your portfolio performs under each.",
  },

  {
    id: "MSCI_COVID_LSHAPE",
    wave: 2,
    type: "historical_template",
    name: "COVID L-Shape (Prolonged)",
    tagline: "Equity −45%, HY spreads +1,250 bps",
    narrative:
      "MSCI's worst-case COVID scenario: prolonged recession, slow recovery. ERP shock +10%, IG spread +420 bps, HY +1,250 bps, oil $25, implied equity return −45%.",
    source: "MSCI COVID-19 Scenarios (L-shape)",
    source_date: "2025-01-01",
    confidence: "high",
    horizon_label: "12–24 month path",
    watch_list: ["liquidity", "refinancing", "breach cascade"],
    shocks: {
      low: { equity_us: -0.27, credit_ig_bps: 252, credit_hy_bps: 750, oil_pct: -0.50 },
      medium: { equity_us: -0.45, credit_ig_bps: 420, credit_hy_bps: 1250, oil_pct: -0.65 },
      high: { equity_us: -0.56, credit_ig_bps: 525, credit_hy_bps: 1562, oil_pct: -0.80 },
    },
    education_note:
      "The L-shape scenario is a permanent demand destruction event. Think Japan post-1990 or the Great Depression. It's low probability but useful to understand what 'worst case' really means for your portfolio over years, not months.",
  },

  {
    id: "IMF25_RISK_OFF_EM",
    wave: 2,
    type: "factor_shock",
    name: "IMF Risk-Off / EM Stress",
    tagline: "USD +10%, S&P −15% — EM under pressure",
    narrative:
      "A risk-off tightening hitting emerging markets via USD strengthening and equity decline. IMF GFSR Apr 2025 Figure 1.13: USD +10%, S&P 500 −15% as published shock parameters.",
    source: "IMF Global Financial Stability Report Apr 2025 (Figure 1.13)",
    source_date: "2025-04-01",
    confidence: "medium",
    horizon_label: "Instantaneous",
    watch_list: ["EM FX exposure", "USD-debt sensitivity", "global growth proxies"],
    shocks: {
      low: { equity_us: -0.10, fx_usd_pct: 0.05, credit_ig_bps: 75, credit_hy_bps: 200 },
      medium: { equity_us: -0.15, fx_usd_pct: 0.10, credit_ig_bps: 150, credit_hy_bps: 400 },
      high: { equity_us: -0.25, fx_usd_pct: 0.15, credit_ig_bps: 300, credit_hy_bps: 800 },
    },
    education_note:
      "When USD strengthens sharply, countries and companies with USD-denominated debt face higher repayment costs. As a Thai investor, you're naturally long USD assets — a risk-off event is less damaging for you than for an emerging market borrower.",
  },

  {
    id: "EUROZONE_2011_STRESS",
    wave: 2,
    type: "historical_template",
    name: "Eurozone Sovereign Stress",
    tagline: "Periphery yields +300–500 bps, bank/sovereign risk",
    narrative:
      "The 2011 European sovereign debt crisis. Italian 10Y yields reached 10.6% (up 372 bps from Nov 17, 2011 levels). Peripheral sovereign spreads blew out as sovereign-bank interconnection amplified stress.",
    source: "ECB Financial Stability Review Dec 2011 (sovereign yield shock example)",
    source_date: "2025-01-01",
    confidence: "medium",
    horizon_label: "Instantaneous to 6-month stress plateau",
    watch_list: ["bank/sovereign overlap", "EUR risk", "financial sector holdings"],
    shocks: {
      low: { equity_eu: -0.20, credit_ig_bps: 150, fx_usd_pct: 0.05, rates_10y_delta: 2.0 },
      medium: { equity_eu: -0.32, credit_ig_bps: 300, fx_usd_pct: 0.08, rates_10y_delta: 3.7 },
      high: { equity_eu: -0.45, credit_ig_bps: 450, fx_usd_pct: 0.12, rates_10y_delta: 5.0 },
    },
    education_note:
      "The Eurozone crisis showed that government debt is not risk-free. When markets doubted that a country could repay, yields spiked — making debt more expensive and creating a vicious cycle. For investors with EU exposure, sovereign risk is a real portfolio factor.",
  },

  {
    id: "TECH_BUST_2000_2002",
    wave: 2,
    type: "historical_template",
    name: "Tech Bust 2000–2002",
    tagline: "Tech sleeve −70% style shock — valuation reset",
    narrative:
      "Nasdaq lost 73.5% from its March 2000 peak. A valuation regime shift wiped out speculative tech holdings over 2+ years. Broad S&P fell ~49%, but tech was the epicenter.",
    source: "Federal Reserve Bank of Boston report (Nasdaq collapse magnitude)",
    source_date: "2025-01-01",
    confidence: "medium",
    horizon_label: "Peak-to-trough block (~30 months)",
    watch_list: ["growth concentration", "unprofitable names", "high-multiple holdings"],
    shocks: {
      low: { equity_us: -0.25, equity_tech: -0.50, credit_ig_bps: 50, rates_10y_delta: -0.50 },
      medium: { equity_us: -0.40, equity_tech: -0.70, credit_ig_bps: 100, rates_10y_delta: -1.00 },
      high: { equity_us: -0.50, equity_tech: -0.80, credit_ig_bps: 200, rates_10y_delta: -2.00 },
    },
    education_note:
      "The dot-com bust proved that 'this time is different' is rarely true. Companies with no earnings and high valuations saw the most extreme losses. Profitable businesses with real cash flows recovered far faster. Your BDD framework identifies which type you own.",
  },

  {
    id: "LTCM_1998_LIQUIDITY",
    wave: 2,
    type: "historical_template",
    name: "LTCM-like Liquidity Shock",
    tagline: "Liquidity evaporates + spread blowout",
    narrative:
      "The 1998 Long-Term Capital Management near-failure showed how liquidity can disappear instantly when highly leveraged convergence trades unwind. LTCM lost −44% in August 1998 alone.",
    source: "FedHistory LTCM near-failure essay",
    source_date: "2025-01-01",
    confidence: "medium",
    horizon_label: "1–3 month shock",
    watch_list: ["crowded trades", "leverage proxies", "spread exposure"],
    shocks: {
      low: { equity_us: -0.10, credit_ig_bps: 75, credit_hy_bps: 200 },
      medium: { equity_us: -0.20, credit_ig_bps: 150, credit_hy_bps: 400 },
      high: { equity_us: -0.30, credit_ig_bps: 300, credit_hy_bps: 800 },
    },
    education_note:
      "LTCM was staffed by Nobel Prize winners and ran sophisticated models. They believed they had captured every risk — except the one they hadn't: the market can stay irrational longer than you can stay solvent. Leverage amplifies not just returns but also fragility.",
  },

  // ════════════════════════ WAVE 3 — ADVANCED ══════════════════════════════════

  {
    id: "CRASH_1987_OPTIONAL",
    wave: 3,
    type: "historical_template",
    name: "Black Monday 1987",
    tagline: "−20% overnight — gap risk test",
    narrative:
      "October 19, 1987: equities fell ~20% in a single day driven by program trading feedback loops and portfolio insurance failures. The fastest single-day crash in history.",
    source: "Federal Reserve Board paper on 1987 crash (Black Monday)",
    source_date: "2025-01-01",
    confidence: "medium",
    horizon_label: "Instantaneous (1 day)",
    watch_list: ["leverage/margin", "stop-loss realism", "gap risk"],
    shocks: {
      low: { equity_us: -0.10 },
      medium: { equity_us: -0.20 },
      high: { equity_us: -0.25 },
    },
    education_note:
      "1987 showed that markets can gap down so fast that stop-losses don't work. By the time you could sell, you'd already lost 20%. For a long-term investor, the lesson is that short-term hedges often fail exactly when you need them most.",
  },

  {
    id: "MOONSHOT_UNWIND",
    wave: 3,
    type: "portfolio_specific",
    name: "Moonshot Sleeve Unwind",
    tagline: "Speculative holdings −70% — conviction test",
    narrative:
      "Your highest-risk, highest-conviction speculative holdings collapse. Based on tech bust magnitude (Nasdaq −73.5%). Tests whether the moonshot sleeve's sizing is calibrated to survive.",
    source: "Tech bust magnitude anchor (Nasdaq collapse) + BDD moonshot framework",
    source_date: "2025-01-01",
    confidence: "medium",
    horizon_label: "Instantaneous to 6-month slide",
    watch_list: ["cap breach", "survival sizing", "portfolio net impact"],
    shocks: {
      low: { equity_tech: -0.50, equity_us: -0.05 },
      medium: { equity_tech: -0.70, equity_us: -0.10 },
      high: { equity_tech: -0.85, equity_us: -0.15 },
    },
    education_note:
      "The BDD moonshot sleeve is designed for asymmetric bets — high probability of loss, but if right, transformative returns. This scenario tests whether you've sized these correctly: can the rest of your portfolio absorb a complete moonshot wipeout?",
  },

  {
    id: "FUNDING_PROFILE_SHOCK",
    wave: 3,
    type: "portfolio_specific",
    name: "Funding / DCA Shock",
    tagline: "Investable income −50% — DCA fragility test",
    narrative:
      "A personal income shock during a downturn forces you to pause or reduce monthly investment contributions. Tests whether your DCA commitments are sustainable under stress.",
    source: "BoE unemployment peaks (8.5% UK, 10% US Fed) as macro anchors",
    source_date: "2025-01-01",
    confidence: "medium",
    horizon_label: "3–12 months",
    watch_list: ["DCA commitments vs runway", "overcommitment flags", "pause/review triggers"],
    shocks: {
      low: { dividend_cut_pct: -0.25 },
      medium: { dividend_cut_pct: -0.50 },
      high: { dividend_cut_pct: -1.00 },
    },
    education_note:
      "DCA (dollar-cost averaging) is powerful — but only if you can sustain the contributions. Many investors plan to DCA monthly but stop exactly when markets are lowest (and most attractive) because personal income dropped at the same time as the market.",
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getScenario(id: string): Scenario | undefined {
  return SCENARIO_LIBRARY.find((s) => s.id === id);
}

export function getWaveScenarios(wave: 1 | 2 | 3): Scenario[] {
  return SCENARIO_LIBRARY.filter((s) => s.wave === wave);
}

export const WAVE1_IDS = SCENARIO_LIBRARY.filter((s) => s.wave === 1).map((s) => s.id);
export const WAVE2_IDS = SCENARIO_LIBRARY.filter((s) => s.wave === 2).map((s) => s.id);
export const WAVE3_IDS = SCENARIO_LIBRARY.filter((s) => s.wave === 3).map((s) => s.id);

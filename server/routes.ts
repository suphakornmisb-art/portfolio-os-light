import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertHoldingSchema } from "@shared/schema";
import type { InsertEnrichment, Enrichment, Holding } from "@shared/schema";
import type { WmbtItem } from "@shared/schema";
import https from "https";
import Groq from "groq-sdk";
import crypto from "crypto";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

function toFmpTicker(ticker: string): string {
  return ticker.replace(".", "-");
}

function fetchFmpJson(path: string): Promise<any> {
  const url = `https://financialmodelingprep.com/stable/${path}${path.includes("?") ? "&" : "?"}apikey=${FMP_API_KEY}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Failed to parse FMP response for ${path}`));
        }
      });
    }).on("error", reject);
  });
}

function fetchFmpQuote(ticker: string): Promise<any> {
  return fetchFmpJson(`quote?symbol=${encodeURIComponent(toFmpTicker(ticker))}`);
}

function median(arr: number[]): number {
  const sorted = [...arr].filter((v) => v != null && isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function cagr(start: number, end: number, years: number): number {
  if (start <= 0 || end <= 0 || years <= 0) return 0;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function enrichTicker(ticker: string): Promise<InsertEnrichment> {
  const fmpTicker = toFmpTicker(ticker);
  const [profileData, keyMetricsData, ratiosData, incomeData, cashFlowData] = await Promise.all([
    fetchFmpJson(`profile?symbol=${encodeURIComponent(fmpTicker)}`),
    fetchFmpJson(`key-metrics?symbol=${encodeURIComponent(fmpTicker)}&period=annual`),
    fetchFmpJson(`ratios?symbol=${encodeURIComponent(fmpTicker)}&period=annual`),
    fetchFmpJson(`income-statement?symbol=${encodeURIComponent(fmpTicker)}&period=annual`),
    fetchFmpJson(`cash-flow-statement?symbol=${encodeURIComponent(fmpTicker)}&period=annual`),
  ]);

  const profile = Array.isArray(profileData) ? profileData[0] : profileData;
  const km = Array.isArray(keyMetricsData) ? keyMetricsData : [];
  const ratios = Array.isArray(ratiosData) ? ratiosData : [];
  const income = Array.isArray(incomeData) ? incomeData : [];
  const cashFlow = Array.isArray(cashFlowData) ? cashFlowData : [];

  // Current ratios from latest
  const latestRatios = ratios[0] || {};
  const latestKm = km[0] || {};
  const latestIncome = income[0] || {};
  const latestCashFlow = cashFlow[0] || {};

  // 5yr median multiples from ratios
  const pe5y = median(ratios.slice(0, 5).map((r: any) => r.priceEarningsRatio));
  const pb5y = median(ratios.slice(0, 5).map((r: any) => r.priceToBookRatio));
  const ps5y = median(ratios.slice(0, 5).map((r: any) => r.priceToSalesRatio));
  const pfcf5y = median(ratios.slice(0, 5).map((r: any) => r.priceToFreeCashFlowsRatio));

  // Revenue & EPS growth (CAGR over available years up to 5)
  const incomeSlice = income.slice(0, 5);
  let revenueGrowth5y = 0;
  let epsGrowth5y = 0;
  if (incomeSlice.length >= 2) {
    const newest = incomeSlice[0];
    const oldest = incomeSlice[incomeSlice.length - 1];
    const years = incomeSlice.length - 1;
    revenueGrowth5y = cagr(oldest.revenue, newest.revenue, years);
    if (oldest.eps > 0 && newest.eps > 0) {
      epsGrowth5y = cagr(oldest.eps, newest.eps, years);
    }
  }

  // FCF margin
  const latestRevenue = latestIncome.revenue || 0;
  const latestFcf = latestCashFlow.freeCashFlow || 0;
  const fcfMargin = latestRevenue > 0 ? (latestFcf / latestRevenue) * 100 : 0;

  // Per-share figures from key-metrics
  const fcfPerShare = latestKm.freeCashFlowPerShare || 0;
  const bookValuePerShare = latestKm.bookValuePerShare || 0;
  const revenuePerShare = latestKm.revenuePerShare || 0;

  return {
    ticker,
    company_name: profile?.companyName || null,
    industry: profile?.industry || null,
    market_cap: profile?.mktCap || null,
    beta: profile?.beta || null,
    pe_ratio: latestRatios.priceEarningsRatio || null,
    pb_ratio: latestRatios.priceToBookRatio || null,
    ps_ratio: latestRatios.priceToSalesRatio || null,
    pfcf_ratio: latestRatios.priceToFreeCashFlowsRatio || null,
    ev_ebitda: latestKm.enterpriseValueOverEBITDA || null,
    roic: latestKm.roic != null ? latestKm.roic * 100 : null,
    roe: latestKm.roe != null ? latestKm.roe * 100 : null,
    gross_margin: latestRatios.grossProfitMargin != null ? latestRatios.grossProfitMargin * 100 : null,
    operating_margin: latestRatios.operatingProfitMargin != null ? latestRatios.operatingProfitMargin * 100 : null,
    net_margin: latestRatios.netProfitMargin != null ? latestRatios.netProfitMargin * 100 : null,
    fcf_margin: fcfMargin || null,
    revenue_growth_5y: revenueGrowth5y || null,
    eps_growth_5y: epsGrowth5y || null,
    net_debt_ebitda: latestKm.netDebtToEBITDA || null,
    dividend_yield: profile?.lastDiv != null && profile?.price != null && profile.price > 0
      ? (profile.lastDiv / profile.price) * 100 : null,
    eps_ttm: profile?.eps || latestIncome.eps || null,
    fcf_per_share: fcfPerShare || null,
    book_value_per_share: bookValuePerShare || null,
    revenue_per_share: revenuePerShare || null,
    pe_5y_median: pe5y || null,
    pb_5y_median: pb5y || null,
    ps_5y_median: ps5y || null,
    pfcf_5y_median: pfcf5y || null,
    enriched_at: new Date().toISOString(),
  };
}

// ── Fair Value Engine ──

interface FairValueResult {
  ticker: string;
  business_type: string;
  anchor_metric: string;
  anchor_value: number;
  reference_multiple: number;
  reference_source: string;
  quality_adjustment: number;
  fair_value: number;
  fair_value_low: number;
  fair_value_high: number;
  uncertainty_class: string;
  band_pct: number;
  price: number;
  pfv_ratio: number;
  valuation_label: string;
  method_trace: string;
  confidence: string;
}

function classifyBusiness(e: Enrichment, holding: Holding): string {
  const sector = (holding.sector || "").toLowerCase();
  const industry = (e.industry || "").toLowerCase();

  // Financial
  if (sector.includes("financial") || industry.includes("bank") || industry.includes("insurance")) {
    return "financial";
  }
  // Early growth: negative EPS + high revenue growth
  if ((e.eps_ttm ?? 0) <= 0 && (e.revenue_growth_5y ?? 0) > 15) {
    return "early_growth";
  }
  // Cyclical
  const cyclicalKeywords = ["mining", "steel", "oil", "gas", "metals", "chemicals"];
  const isCyclical = cyclicalKeywords.some((kw) => industry.includes(kw)) ||
    sector.includes("materials") || sector.includes("energy");
  if (isCyclical) return "cyclical";

  // Cash generative
  if ((e.fcf_margin ?? 0) > 12) return "cash_generative";

  return "mature_profitable";
}

function computeFairValue(e: Enrichment, holding: Holding, price: number): FairValueResult {
  const bType = classifyBusiness(e, holding);

  let anchorMetric = "";
  let anchorValue = 0;
  let refMultiple = 0;
  let refSource = "";

  switch (bType) {
    case "mature_profitable":
      anchorMetric = "EPS";
      anchorValue = e.eps_ttm ?? 0;
      refMultiple = e.pe_5y_median ?? 15;
      refSource = "5yr median P/E";
      break;
    case "cash_generative":
      anchorMetric = "FCF/share";
      anchorValue = e.fcf_per_share ?? 0;
      refMultiple = e.pfcf_5y_median ?? 20;
      refSource = "5yr median P/FCF";
      break;
    case "early_growth":
      anchorMetric = "Revenue/share";
      anchorValue = e.revenue_per_share ?? 0;
      refMultiple = e.ps_5y_median ?? 5;
      refSource = "5yr median P/S";
      break;
    case "financial":
      anchorMetric = "Book value/share";
      anchorValue = e.book_value_per_share ?? 0;
      refMultiple = e.pb_5y_median ?? 2;
      refSource = "5yr median P/B";
      break;
    case "cyclical": {
      // normalized EPS = average of available EPS over 5yr
      anchorMetric = "Normalized EPS";
      anchorValue = e.eps_ttm ?? 0; // fallback to current
      refMultiple = e.pe_5y_median ?? 12;
      refSource = "5yr median P/E";
      break;
    }
  }

  // Quality adjustment
  let qualAdj = 0;
  if ((e.roic ?? 0) > 15) qualAdj += 0.05;
  if ((e.revenue_growth_5y ?? 0) > 10) qualAdj += 0.05;
  if ((e.operating_margin ?? 0) > 20) qualAdj += 0.05;
  if ((e.net_debt_ebitda ?? 0) > 3) qualAdj -= 0.05;
  if ((e.roic ?? 0) < 8 && (e.roic ?? 0) !== 0) qualAdj -= 0.05;
  qualAdj = Math.max(-0.2, Math.min(0.2, qualAdj));

  const fvPoint = anchorValue * refMultiple * (1 + qualAdj);

  // Uncertainty
  const beta = e.beta ?? 1;
  const opMargin = e.operating_margin ?? 15;
  const netDebt = e.net_debt_ebitda ?? 0;
  const epsTtm = e.eps_ttm ?? 0;
  const fcfPerShare = e.fcf_per_share ?? 0;

  let uncertaintyClass = "Medium";
  let bandPct = 0.3;

  if (epsTtm <= 0 && fcfPerShare <= 0) {
    uncertaintyClass = "Extreme";
    bandPct = 0.7;
  } else if (beta > 1.8 || epsTtm <= 0) {
    uncertaintyClass = "Very High";
    bandPct = 0.55;
  } else if (beta > 1.3 || opMargin < 10) {
    uncertaintyClass = "High";
    bandPct = 0.4;
  } else if (beta < 0.8 && opMargin > 20 && netDebt < 1) {
    uncertaintyClass = "Low";
    bandPct = 0.2;
  }

  const fvLow = fvPoint * (1 - bandPct);
  const fvHigh = fvPoint * (1 + bandPct);

  // Valuation label
  let valLabel = "Fair Range";
  if (price < fvLow) valLabel = "Deep Discount";
  else if (price < fvPoint * (1 - bandPct / 2)) valLabel = "Discount";
  else if (price > fvHigh) valLabel = "Rich";
  else if (price > fvPoint * (1 + bandPct / 2)) valLabel = "Premium";

  const pfvRatio = fvPoint > 0 ? price / fvPoint : 0;

  // Quality explanation
  const qualParts: string[] = [];
  if ((e.roic ?? 0) > 15) qualParts.push("ROIC strong");
  if ((e.revenue_growth_5y ?? 0) > 10) qualParts.push("growth >10%");
  if ((e.operating_margin ?? 0) > 20) qualParts.push("high margins");
  if ((e.net_debt_ebitda ?? 0) > 3) qualParts.push("high debt");
  if ((e.roic ?? 0) < 8 && (e.roic ?? 0) !== 0) qualParts.push("low ROIC");
  const qualStr = qualParts.length > 0 ? ` (${qualParts.join(", ")})` : "";

  const trace = `Anchor: ${anchorMetric} ($${anchorValue.toFixed(2)}) × ${refSource} (${refMultiple.toFixed(1)}) × quality ${qualAdj >= 0 ? "+" : ""}${(qualAdj * 100).toFixed(0)}%${qualStr} = $${fvPoint.toFixed(2)}`;

  return {
    ticker: e.ticker,
    business_type: bType,
    anchor_metric: anchorMetric,
    anchor_value: Math.round(anchorValue * 100) / 100,
    reference_multiple: Math.round(refMultiple * 10) / 10,
    reference_source: refSource,
    quality_adjustment: Math.round(qualAdj * 100) / 100,
    fair_value: Math.round(fvPoint * 100) / 100,
    fair_value_low: Math.round(fvLow * 100) / 100,
    fair_value_high: Math.round(fvHigh * 100) / 100,
    uncertainty_class: uncertaintyClass,
    band_pct: bandPct,
    price: Math.round(price * 100) / 100,
    pfv_ratio: Math.round(pfvRatio * 100) / 100,
    valuation_label: valLabel,
    method_trace: trace,
    confidence: uncertaintyClass === "Low" || uncertaintyClass === "Medium" ? "high" : "moderate",
  };
}

// ── Performance Calculations ──

interface PerformanceResult {
  twr: number;
  mwr: number;
  daily_values: { date: string; value: number; twr_cumulative: number }[];
  annualized_return: number;
  total_return_pct: number;
  max_drawdown: number;
  inflation_comparison: { date: string; value: number }[];
  beating_inflation: boolean;
}

function computePerformance(snaps: { date: string; total_value: number; total_cost: number; deposits: number; withdrawals: number }[]): PerformanceResult {
  if (snaps.length < 2) {
    const singleValue = snaps.length === 1 ? snaps[0].total_value : 0;
    return {
      twr: 0, mwr: 0,
      daily_values: snaps.map((s) => ({ date: s.date, value: s.total_value, twr_cumulative: 0 })),
      annualized_return: 0, total_return_pct: 0, max_drawdown: 0,
      inflation_comparison: snaps.map((s) => ({ date: s.date, value: snaps[0]?.total_value || 0 })),
      beating_inflation: false,
    };
  }

  // TWR: chain-link
  let twrProduct = 1;
  const dailyValues: { date: string; value: number; twr_cumulative: number }[] = [];

  for (let i = 0; i < snaps.length; i++) {
    if (i === 0) {
      dailyValues.push({ date: snaps[i].date, value: snaps[i].total_value, twr_cumulative: 0 });
      continue;
    }
    const prev = snaps[i - 1];
    const curr = snaps[i];
    const netFlow = (curr.deposits || 0) - (curr.withdrawals || 0);
    const denominator = prev.total_value + netFlow * 0.5; // weight flows at midpoint
    if (denominator > 0) {
      const periodReturn = (curr.total_value - prev.total_value - netFlow) / denominator;
      twrProduct *= (1 + periodReturn);
    }
    dailyValues.push({
      date: curr.date,
      value: curr.total_value,
      twr_cumulative: (twrProduct - 1) * 100,
    });
  }
  const twr = (twrProduct - 1) * 100;

  // Modified Dietz MWR
  const firstDate = new Date(snaps[0].date);
  const lastDate = new Date(snaps[snaps.length - 1].date);
  const totalDays = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / 86400000);
  const startValue = snaps[0].total_value;
  const endValue = snaps[snaps.length - 1].total_value;

  let totalNetFlows = 0;
  let weightedFlows = 0;
  for (let i = 1; i < snaps.length; i++) {
    const nf = (snaps[i].deposits || 0) - (snaps[i].withdrawals || 0);
    totalNetFlows += nf;
    const dayOfFlow = (new Date(snaps[i].date).getTime() - firstDate.getTime()) / 86400000;
    const weight = (totalDays - dayOfFlow) / totalDays;
    weightedFlows += nf * weight;
  }
  const mwrDenom = startValue + weightedFlows;
  const mwr = mwrDenom > 0 ? ((endValue - startValue - totalNetFlows) / mwrDenom) * 100 : 0;

  // Annualized return
  const years = totalDays / 365.25;
  const annualized = years > 0 && twrProduct > 0 ? (Math.pow(twrProduct, 1 / years) - 1) * 100 : 0;

  // Max drawdown
  let peak = 0;
  let maxDD = 0;
  for (const dv of dailyValues) {
    if (dv.value > peak) peak = dv.value;
    const dd = peak > 0 ? ((peak - dv.value) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  // Inflation comparison: 3% annual
  const inflationComparison = snaps.map((s) => {
    const d = new Date(s.date);
    const daysSinceStart = (d.getTime() - firstDate.getTime()) / 86400000;
    const inflatedValue = startValue * Math.pow(1.03, daysSinceStart / 365.25);
    return { date: s.date, value: Math.round(inflatedValue * 100) / 100 };
  });

  const beatingInflation = twr > (years * 3);

  return {
    twr: Math.round(twr * 100) / 100,
    mwr: Math.round(mwr * 100) / 100,
    daily_values: dailyValues,
    annualized_return: Math.round(annualized * 100) / 100,
    total_return_pct: Math.round(twr * 100) / 100,
    max_drawdown: Math.round(maxDD * 100) / 100,
    inflation_comparison: inflationComparison,
    beating_inflation: beatingInflation,
  };
}

// ── Thesis Rate Limiting ──
let lastGroqCallTime = 0;
async function groqRateLimit() {
  const now = Date.now();
  const timeSinceLast = now - lastGroqCallTime;
  if (timeSinceLast < 500) {
    await delay(500 - timeSinceLast);
  }
  lastGroqCallTime = Date.now();
}

// ── Relationships (LLM-powered via Groq) ──

function computeTickerHash(tickers: string[]): string {
  const sorted = [...tickers].sort().join(",");
  return crypto.createHash("md5").update(sorted).digest("hex");
}

function computeFallbackRelationships(holdingsData: Holding[], enrichmentsData: Enrichment[], totalMktValue: number, prices: Record<string, number>) {
  const enrichMap = new Map<string, Enrichment>();
  for (const e of enrichmentsData) enrichMap.set(e.ticker, e);

  const nodes = holdingsData.map((h) => {
    const price = prices[h.ticker] || 0;
    const mktVal = price * h.shares;
    const weight = totalMktValue > 0 ? (mktVal / totalMktValue) * 100 : 0;
    const enr = enrichMap.get(h.ticker);
    return { ticker: h.ticker, bdd_type: h.bdd_type, sector: h.sector, industry: enr?.industry || "", weight: Math.round(weight * 100) / 100 };
  });

  const edges: any[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].sector && nodes[j].sector && nodes[i].sector === nodes[j].sector && !nodes[i].sector.startsWith("ETF")) {
        edges.push({ source: nodes[i].ticker, target: nodes[j].ticker, type: "sector_overlap", reason: `Both in ${nodes[i].sector}`, strength: 0.7 });
      }
    }
  }

  const sectorGroups = new Map<string, { tickers: string[]; weight: number }>();
  for (const n of nodes) {
    const s = n.sector || "Unknown";
    if (!sectorGroups.has(s)) sectorGroups.set(s, { tickers: [], weight: 0 });
    const g = sectorGroups.get(s)!;
    g.tickers.push(n.ticker);
    g.weight += n.weight;
  }

  const clusters = Array.from(sectorGroups.entries()).map(([name, g]) => ({
    name, description: `Sector cluster: ${name}`, tickers: g.tickers, theme: name,
  })).sort((a, b) => {
    const wa = sectorGroups.get(a.name)!.weight;
    const wb = sectorGroups.get(b.name)!.weight;
    return wb - wa;
  });

  return {
    nodes,
    edges,
    clusters,
    hidden_concentrations: [],
    key_insights: ["Run AI analysis for deeper relationship insights."],
    source: "fallback" as const,
  };
}

async function analyzeRelationshipsWithLLM(
  holdingsData: Holding[],
  enrichmentsData: Enrichment[],
  totalMktValue: number,
  prices: Record<string, number>,
) {
  const enrichMap = new Map<string, Enrichment>();
  for (const e of enrichmentsData) enrichMap.set(e.ticker, e);

  const nodes = holdingsData.map((h) => {
    const price = prices[h.ticker] || 0;
    const mktVal = price * h.shares;
    const weight = totalMktValue > 0 ? (mktVal / totalMktValue) * 100 : 0;
    const enr = enrichMap.get(h.ticker);
    return {
      ticker: h.ticker,
      bdd_type: h.bdd_type,
      sector: h.sector,
      industry: enr?.industry || "",
      weight: Math.round(weight * 100) / 100,
      company_name: enr?.company_name || h.ticker,
      beta: enr?.beta,
      operating_margin: enr?.operating_margin,
      market_cap: enr?.market_cap,
      revenue_growth_5y: enr?.revenue_growth_5y,
    };
  });

  // Build the prompt with portfolio context
  const holdingsSummary = nodes
    .sort((a, b) => b.weight - a.weight)
    .map((n) => `${n.ticker} (${n.company_name}): sector=${n.sector}, industry=${n.industry}, bdd_type=${n.bdd_type}, weight=${n.weight}%, beta=${n.beta ?? "N/A"}, opMargin=${n.operating_margin ? n.operating_margin.toFixed(1) + "%" : "N/A"}, revGrowth5y=${n.revenue_growth_5y ? n.revenue_growth_5y.toFixed(1) + "%" : "N/A"}`)
    .join("\n");

  const prompt = `You are a portfolio analyst. Analyze this investment portfolio and identify NON-OBVIOUS relationships between holdings. Focus on supply chain dependencies, revenue correlations across different sectors, thematic overlaps (e.g. AI infrastructure, EM fintech, digital payments ecosystem), inverse/hedge relationships, and competitive dynamics.

Portfolio holdings:
${holdingsSummary}

BDD types: engine=steady compounders, builder=growth/optionality, grounder=defensive/value, moonshot=speculative

Return a JSON object with EXACTLY this structure:
{
  "edges": [
    {"source": "TICKER1", "target": "TICKER2", "type": "supply_chain|revenue_correlation|thematic|inverse|sector_overlap|competitor", "reason": "brief explanation", "strength": 0.5-0.95}
  ],
  "clusters": [
    {"name": "Cluster Name", "description": "Why these holdings are thematically linked", "tickers": ["TICK1", "TICK2"], "theme": "theme_keyword"}
  ],
  "hidden_concentrations": [
    {"theme": "Theme name", "tickers": ["TICK1", "TICK2"], "risk_note": "Why this concentration matters"}
  ],
  "key_insights": ["Insight 1", "Insight 2", "Insight 3"]
}

Rules:
- Return 15-25 edges focusing on the MOST interesting cross-sector connections. Avoid trivial same-sector edges.
- Return 4-8 thematic clusters that go BEYOND simple sector grouping.
- Identify 2-4 hidden concentrations that aren't obvious from sector labels alone.
- Return 3-5 key insights about portfolio structure.
- Only use tickers that exist in the portfolio above.
- strength values: 0.9+ for direct supply chain, 0.7-0.9 for strong thematic, 0.5-0.7 for moderate correlation.
- Return ONLY valid JSON, no markdown.`;

  const groq = new Groq({ apiKey: GROQ_API_KEY });

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 4000,
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);

  return {
    nodes,
    edges: parsed.edges || [],
    clusters: parsed.clusters || [],
    hidden_concentrations: parsed.hidden_concentrations || [],
    key_insights: parsed.key_insights || [],
    source: "llm" as const,
  };
}

// ── Seed Data ──
const SEED_DATA = [
  { ticker: "SCHD", shares: 300.485687, avg_cost: 30.9534, bdd_type: "grounder", sector: "ETF - Dividend Equity", notes: "Dividend/value ETF; income and ballast" },
  { ticker: "VOO", shares: 11.1565221, avg_cost: 594.0462, bdd_type: "engine", sector: "ETF - Broad Market", notes: "Core S&P 500 compounding sleeve" },
  { ticker: "GOOGL", shares: 10.6384989, avg_cost: 293.2848, bdd_type: "engine", sector: "Communication Services", notes: "Digital ads, search, and AI platform" },
  { ticker: "NVDA", shares: 16.0445015, avg_cost: 178.6033, bdd_type: "builder", sector: "Information Technology", notes: "AI compute leader; secular growth" },
  { ticker: "MSFT", shares: 7.6681841, avg_cost: 372.7034, bdd_type: "engine", sector: "Information Technology", notes: "Software and cloud compounder" },
  { ticker: "V", shares: 8.4361164, avg_cost: 305.0469, bdd_type: "engine", sector: "Financials", notes: "Global payments network compounder" },
  { ticker: "VXUS", shares: 30.7112215, avg_cost: 77.1059, bdd_type: "grounder", sector: "ETF - International Equity", notes: "Ex-US diversification sleeve" },
  { ticker: "AMZN", shares: 8.0040569, avg_cost: 205.2299, bdd_type: "builder", sector: "Consumer Discretionary", notes: "Commerce and cloud growth platform" },
  { ticker: "IWF", shares: 3.8796944, avg_cost: 428.4538, bdd_type: "builder", sector: "ETF - Growth Equity", notes: "US large-cap growth tilt" },
  { ticker: "SPGI", shares: 3.9523783, avg_cost: 417.7007, bdd_type: "engine", sector: "Financials", notes: "Ratings and data toll-booth business" },
  { ticker: "META", shares: 2.6024417, avg_cost: 580.4088, bdd_type: "engine", sector: "Communication Services", notes: "Ad engine with AI optionality" },
  { ticker: "JPM", shares: 4.0916833, avg_cost: 287.2093, bdd_type: "grounder", sector: "Financials", notes: "High-quality bank and capital markets franchise" },
  { ticker: "VTV", shares: 5.1533174, avg_cost: 196.3635, bdd_type: "grounder", sector: "ETF - Value Equity", notes: "US value and defensive tilt" },
  { ticker: "MA", shares: 2.0301092, avg_cost: 497.8845, bdd_type: "engine", sector: "Financials", notes: "Global payments network compounder" },
  { ticker: "UNH", shares: 2.1147775, avg_cost: 288.2478, bdd_type: "grounder", sector: "Health Care", notes: "Healthcare cash flow and defensive exposure" },
  { ticker: "CEG", shares: 2.109793, avg_cost: 295.8032, bdd_type: "builder", sector: "Utilities", notes: "Power and nuclear demand growth" },
  { ticker: "TSM", shares: 1.4350864, avg_cost: 327.4437, bdd_type: "builder", sector: "Information Technology", notes: "Semiconductor manufacturing backbone" },
  { ticker: "NDAQ", shares: 6.3000941, avg_cost: 83.9267, bdd_type: "engine", sector: "Financials", notes: "Exchange and market infrastructure compounder" },
  { ticker: "IBKR", shares: 5.9403312, avg_cost: 66.7576, bdd_type: "engine", sector: "Financials", notes: "Brokerage platform with scalable economics" },
  { ticker: "HD", shares: 1.0089868, avg_cost: 355.4853, bdd_type: "grounder", sector: "Consumer Discretionary", notes: "Home improvement cash generator" },
  { ticker: "AAPL", shares: 1.2202758, avg_cost: 253.4591, bdd_type: "engine", sector: "Information Technology", notes: "Consumer tech ecosystem compounder" },
  { ticker: "GE", shares: 1.0098464, avg_cost: 307.9577, bdd_type: "builder", sector: "Industrials", notes: "Aerospace-led industrial rebuild story" },
  { ticker: "WM", shares: 1.2976481, avg_cost: 240.7741, bdd_type: "grounder", sector: "Industrials", notes: "Waste collection and landfill moat" },
  { ticker: "GRAB", shares: 70.3579539, avg_cost: 4.1059, bdd_type: "moonshot", sector: "Consumer Discretionary", notes: "SEA platform with optionality" },
  { ticker: "AMD", shares: 1.0007821, avg_cost: 202.012, bdd_type: "builder", sector: "Information Technology", notes: "Compute challenger with AI upside" },
  { ticker: "NUE", shares: 1.0005546, avg_cost: 168.9363, bdd_type: "grounder", sector: "Materials", notes: "Disciplined steel operator and cyclical ballast" },
  { ticker: "AMT", shares: 1.0037558, avg_cost: 185.4382, bdd_type: "grounder", sector: "Real Estate", notes: "Cell tower infrastructure REIT" },
  { ticker: "CRM", shares: 1.0015088, avg_cost: 196.184, bdd_type: "builder", sector: "Information Technology", notes: "Enterprise software platform with AI angle" },
  { ticker: "ICE", shares: 1.0037503, avg_cost: 158.386, bdd_type: "engine", sector: "Financials", notes: "Exchange, data, and mortgage infrastructure" },
  { ticker: "BRK.B", shares: 0.3137377, avg_cost: 486.298, bdd_type: "engine", sector: "Financials", notes: "Capital allocation machine and quality conglomerate" },
  { ticker: "NBIS", shares: 1.0, avg_cost: 98.93, bdd_type: "moonshot", sector: "Information Technology", notes: "Speculative AI infrastructure optionality" },
  { ticker: "WMT", shares: 1.0045322, avg_cost: 127.532, bdd_type: "grounder", sector: "Consumer Staples", notes: "Defensive retail scale and resilience" },
  { ticker: "RELX", shares: 3.0196478, avg_cost: 34.355, bdd_type: "engine", sector: "Industrials", notes: "Information analytics and data subscriptions" },
  { ticker: "MELI", shares: 0.0548451, avg_cost: 1752.024, bdd_type: "builder", sector: "Consumer Discretionary", notes: "LatAm commerce and fintech platform" },
  { ticker: "RKLB", shares: 1.039959, avg_cost: 68.5989, bdd_type: "moonshot", sector: "Industrials", notes: "Space launch and space systems optionality" },
  { ticker: "ADBE", shares: 0.3060751, avg_cost: 267.9735, bdd_type: "engine", sector: "Information Technology", notes: "Creative software franchise" },
  { ticker: "ASML", shares: 0.0393552, avg_cost: 1444.2801, bdd_type: "engine", sector: "Information Technology", notes: "Critical lithography monopoly" },
  { ticker: "EQIX", shares: 0.0333768, avg_cost: 959.65, bdd_type: "grounder", sector: "Real Estate", notes: "Data center infrastructure REIT" },
  { ticker: "ADUR", shares: 1.0, avg_cost: 10.82, bdd_type: "moonshot", sector: "Industrials", notes: "Speculative clean-tech optionality" },
  { ticker: "NU", shares: 0.4353693, avg_cost: 14.08, bdd_type: "builder", sector: "Financials", notes: "Digital banking growth in LatAm" },
];

async function seedIfEmpty() {
  const count = await storage.countHoldings();
  if (count === 0) {
    for (const h of SEED_DATA) {
      await storage.createHolding(h);
    }
    console.log(`Seeded ${SEED_DATA.length} holdings`);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedIfEmpty();

  // ── Holdings ──
  app.get("/api/holdings", async (_req, res) => {
    const all = await storage.getAllHoldings();
    res.json(all);
  });

  app.post("/api/holdings", async (req, res) => {
    const parsed = insertHoldingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const created = await storage.createHolding(parsed.data);
    res.status(201).json(created);
  });

  app.patch("/api/holdings/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const updated = await storage.updateHolding(id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/holdings/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await storage.deleteHolding(id);
    res.json({ success: true });
  });

  app.get("/api/prices", async (_req, res) => {
    try {
      const all = await storage.getAllHoldings();
      const tickers = [...new Set(all.map((h) => h.ticker))];
      const results: Record<string, any> = {};
      const promises = tickers.map(async (ticker) => {
        try {
          const data = await fetchFmpQuote(ticker);
          if (Array.isArray(data) && data.length > 0) results[ticker] = data[0];
          else if (data && !Array.isArray(data)) results[ticker] = data;
        } catch (err) {
          console.error(`FMP fetch error for ${ticker}:`, err);
        }
      });
      await Promise.all(promises);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  app.get("/api/prices/:ticker", async (req, res) => {
    try {
      const data = await fetchFmpQuote(req.params.ticker);
      if (Array.isArray(data) && data.length > 0) res.json(data[0]);
      else res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch price" });
    }
  });

  app.post("/api/holdings/import", async (req, res) => {
    const { holdings: holdingsList } = req.body;
    if (!Array.isArray(holdingsList)) return res.status(400).json({ error: "holdings must be an array" });
    const imported = await storage.clearAndImport(holdingsList);
    res.json(imported);
  });

  // ── Screenshot Import (Groq Vision) ──
  app.post("/api/holdings/import-screenshot", async (req, res) => {
    try {
      const { images } = req.body; // Array of { data: base64string, mimeType: "image/jpeg" }
      if (!Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "images array required" });
      }
      if (!GROQ_API_KEY) {
        return res.status(400).json({ error: "GROQ_API_KEY not configured" });
      }

      const groq = new Groq({ apiKey: GROQ_API_KEY });
      const extracted: { ticker: string; shares: number; avg_cost: number; notes: string }[] = [];

      for (const img of images) {
        try {
          const completion = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Extract the stock transaction from this brokerage screenshot.
Return ONLY a JSON object with these exact fields:
{
  "ticker": "SYMBOL",
  "shares": 0.123,
  "avg_cost": 123.45,
  "action": "buy" or "sell",
  "notes": "brief context"
}

Rules:
- ticker: the US stock symbol shown (e.g. SPGI, MSFT, AAPL)
- shares: the number of shares/quantity
- avg_cost: the executed price in USD (not THB). If only THB is shown, use the exchange rate to convert.
- action: whether this is a buy or sell order
- notes: include the date and any useful context

Return ONLY valid JSON, no markdown, no explanation.`,
                },
                {
                  type: "image_url",
                  image_url: { url: `data:${img.mimeType || "image/jpeg"};base64,${img.data}` },
                },
              ],
            }],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 300,
          });

          const raw = completion.choices[0]?.message?.content || "{}";
          const parsed = JSON.parse(raw);
          if (parsed.ticker && typeof parsed.shares === "number" && typeof parsed.avg_cost === "number") {
            extracted.push({
              ticker: parsed.ticker.toUpperCase().replace(/-/g, "."),
              shares: parsed.shares,
              avg_cost: parsed.avg_cost,
              notes: parsed.notes || "",
            });
          }
        } catch (err: any) {
          console.error("Vision extraction error:", err.message);
          // Continue with other images
        }
        await delay(300); // rate limit
      }

      // Now compute diff against existing holdings
      const existing = await storage.getAllHoldings();
      const existingMap = new Map(existing.map(h => [h.ticker, h]));

      const diff = extracted.map(e => {
        const ex = existingMap.get(e.ticker);
        if (ex) {
          // Compute new weighted avg cost
          const totalShares = ex.shares + e.shares;
          const newAvgCost = totalShares > 0
            ? ((ex.shares * ex.avg_cost) + (e.shares * e.avg_cost)) / totalShares
            : e.avg_cost;
          return {
            ticker: e.ticker,
            action: "update" as const,
            existing_shares: ex.shares,
            new_shares: totalShares,
            existing_avg_cost: ex.avg_cost,
            new_avg_cost: Math.round(newAvgCost * 10000) / 10000,
            added_shares: e.shares,
            added_cost: e.avg_cost,
            notes: e.notes,
            existing_id: ex.id,
          };
        } else {
          return {
            ticker: e.ticker,
            action: "create" as const,
            existing_shares: 0,
            new_shares: e.shares,
            existing_avg_cost: 0,
            new_avg_cost: e.avg_cost,
            added_shares: e.shares,
            added_cost: e.avg_cost,
            notes: e.notes,
            existing_id: null,
          };
        }
      });

      res.json({ extracted, diff });
    } catch (err: any) {
      console.error("Screenshot import error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Apply Screenshot Import ──
  app.post("/api/holdings/apply-import", async (req, res) => {
    try {
      const { changes } = req.body; // Array of diff items to apply
      if (!Array.isArray(changes)) return res.status(400).json({ error: "changes array required" });

      const results: Holding[] = [];
      for (const c of changes) {
        if (c.action === "update" && c.existing_id) {
          const updated = await storage.updateHolding(c.existing_id, {
            shares: c.new_shares,
            avg_cost: c.new_avg_cost,
          });
          if (updated) results.push(updated);
        } else if (c.action === "create") {
          const created = await storage.createHolding({
            ticker: c.ticker,
            shares: c.new_shares,
            avg_cost: c.new_avg_cost,
            bdd_type: "engine",
            sector: "",
            notes: c.notes || "",
          });
          results.push(created);
        }
      }
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Enrichments ──
  app.get("/api/enrichments", async (_req, res) => {
    const all = await storage.getAllEnrichments();
    res.json(all);
  });

  app.post("/api/enrichments/refresh", async (req, res) => {
    try {
      const { ticker } = req.body;
      if (!ticker) return res.status(400).json({ error: "ticker required" });
      // Skip ETFs
      if (ticker.startsWith("ETF") || ["SCHD", "VOO", "VXUS", "IWF", "VTV"].includes(ticker)) {
        return res.json({ skipped: true, ticker, reason: "ETF" });
      }
      const data = await enrichTicker(ticker);
      const saved = await storage.upsertEnrichment(data);
      res.json(saved);
    } catch (err: any) {
      console.error("Enrich error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/enrichments/refresh-all", async (_req, res) => {
    try {
      const all = await storage.getAllHoldings();
      const etfTickers = ["SCHD", "VOO", "VXUS", "IWF", "VTV"];
      const tickers = [...new Set(all.map((h) => h.ticker))].filter(
        (t) => !etfTickers.includes(t) && !t.startsWith("ETF")
      );
      let count = 0;
      for (const ticker of tickers) {
        try {
          const data = await enrichTicker(ticker);
          await storage.upsertEnrichment(data);
          count++;
        } catch (err) {
          console.error(`Failed to enrich ${ticker}:`, err);
        }
        await delay(300); // rate limit
      }
      res.json({ success: true, enriched: count, total: tickers.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Fair Value ──
  app.get("/api/fair-value/:ticker", async (req, res) => {
    try {
      const ticker = req.params.ticker;
      const enrichment = await storage.getEnrichment(ticker);
      if (!enrichment) return res.status(404).json({ error: "Enrichment not found. Run refresh first." });

      const allHoldings = await storage.getAllHoldings();
      const holding = allHoldings.find((h) => h.ticker === ticker);
      if (!holding) return res.status(404).json({ error: "Holding not found" });

      const quoteData = await fetchFmpQuote(ticker);
      const price = Array.isArray(quoteData) && quoteData.length > 0 ? quoteData[0].price : quoteData?.price || 0;

      const result = computeFairValue(enrichment, holding, price);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/fair-value", async (_req, res) => {
    try {
      const allEnrichments = await storage.getAllEnrichments();
      const allHoldings = await storage.getAllHoldings();

      // Get prices
      const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
      const priceMap: Record<string, number> = {};
      const pricePromises = tickers.map(async (ticker) => {
        try {
          const data = await fetchFmpQuote(ticker);
          if (Array.isArray(data) && data.length > 0) priceMap[ticker] = data[0].price || 0;
          else if (data?.price) priceMap[ticker] = data.price;
        } catch {}
      });
      await Promise.all(pricePromises);

      const results: FairValueResult[] = [];
      for (const e of allEnrichments) {
        const holding = allHoldings.find((h) => h.ticker === e.ticker);
        if (!holding) continue;
        const price = priceMap[e.ticker] || 0;
        if (price <= 0) continue;
        results.push(computeFairValue(e, holding, price));
      }
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Snapshots ──
  app.get("/api/snapshots", async (_req, res) => {
    const all = await storage.getAllSnapshots();
    res.json(all);
  });

  app.post("/api/snapshots", async (req, res) => {
    try {
      const { date, total_value, total_cost, deposits, withdrawals } = req.body;
      const snap = await storage.createSnapshot({
        date, total_value, total_cost,
        deposits: deposits || 0, withdrawals: withdrawals || 0,
      });
      res.json(snap);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/snapshots/auto", async (_req, res) => {
    try {
      const allHoldings = await storage.getAllHoldings();
      const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
      const priceMap: Record<string, number> = {};
      const pricePromises = tickers.map(async (ticker) => {
        try {
          const data = await fetchFmpQuote(ticker);
          if (Array.isArray(data) && data.length > 0) priceMap[ticker] = data[0].price || 0;
          else if (data?.price) priceMap[ticker] = data.price;
        } catch {}
      });
      await Promise.all(pricePromises);

      let totalValue = 0;
      let totalCost = 0;
      for (const h of allHoldings) {
        const price = priceMap[h.ticker] || 0;
        totalValue += price * h.shares;
        totalCost += h.avg_cost * h.shares;
      }

      const today = new Date().toISOString().split("T")[0];
      const snap = await storage.createSnapshot({
        date: today,
        total_value: Math.round(totalValue * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        deposits: 0,
        withdrawals: 0,
      });
      res.json(snap);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/performance", async (_req, res) => {
    try {
      const snaps = await storage.getAllSnapshots();
      const snapData = snaps.map((s) => ({
        date: s.date,
        total_value: s.total_value,
        total_cost: s.total_cost,
        deposits: s.deposits ?? 0,
        withdrawals: s.withdrawals ?? 0,
      }));
      const result = computePerformance(snapData);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Relationships (LLM-powered) ──

  // Helper to fetch prices and compute total mkt value
  async function fetchPricesForHoldings(allHoldings: Holding[]) {
    const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
    const priceMap: Record<string, number> = {};
    const pricePromises = tickers.map(async (ticker) => {
      try {
        const data = await fetchFmpQuote(ticker);
        if (Array.isArray(data) && data.length > 0) priceMap[ticker] = data[0].price || 0;
        else if (data?.price) priceMap[ticker] = data.price;
      } catch {}
    });
    await Promise.all(pricePromises);
    let totalMktValue = 0;
    for (const h of allHoldings) {
      totalMktValue += (priceMap[h.ticker] || 0) * h.shares;
    }
    return { priceMap, totalMktValue };
  }

  // GET cached or fallback relationships
  app.get("/api/relationships", async (_req, res) => {
    try {
      const allHoldings = await storage.getAllHoldings();
      const allEnrichments = await storage.getAllEnrichments();
      const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
      const tickerHash = computeTickerHash(tickers);

      // Check cache (24hr TTL)
      const cached = await storage.getRelationshipGraph(tickerHash);
      if (cached) {
        const age = Date.now() - new Date(cached.computed_at).getTime();
        if (age < 24 * 60 * 60 * 1000) {
          try {
            const result = JSON.parse(cached.result_json);
            return res.json(result);
          } catch {}
        }
      }

      // No cache — return fallback deterministic
      const { priceMap, totalMktValue } = await fetchPricesForHoldings(allHoldings);
      const result = computeFallbackRelationships(allHoldings, allEnrichments, totalMktValue, priceMap);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST analyze with Groq LLM
  app.post("/api/relationships/analyze", async (_req, res) => {
    try {
      const allHoldings = await storage.getAllHoldings();
      const allEnrichments = await storage.getAllEnrichments();
      const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
      const tickerHash = computeTickerHash(tickers);

      // Check fresh cache first
      const cached = await storage.getRelationshipGraph(tickerHash);
      if (cached) {
        const age = Date.now() - new Date(cached.computed_at).getTime();
        if (age < 24 * 60 * 60 * 1000) {
          try {
            const result = JSON.parse(cached.result_json);
            if (result.source === "llm") {
              return res.json(result);
            }
          } catch {}
        }
      }

      const { priceMap, totalMktValue } = await fetchPricesForHoldings(allHoldings);

      let result: any;
      try {
        result = await analyzeRelationshipsWithLLM(allHoldings, allEnrichments, totalMktValue, priceMap);
      } catch (llmErr: any) {
        console.error("Groq LLM failed, falling back to deterministic:", llmErr.message);
        result = computeFallbackRelationships(allHoldings, allEnrichments, totalMktValue, priceMap);
        result.key_insights = [`AI analysis failed (${llmErr.message}). Showing sector-based fallback.`, ...result.key_insights];
      }

      // Cache the result
      await storage.upsertRelationshipGraph({
        ticker_hash: tickerHash,
        result_json: JSON.stringify(result),
        computed_at: new Date().toISOString(),
      });

      res.json(result);
    } catch (err: any) {
      console.error("Relationship analysis error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Thesis & Devil's Advocate ──

  // GET thesis for a ticker
  app.get("/api/thesis/:ticker", async (req, res) => {
    try {
      const thesis = await storage.getThesis(req.params.ticker);
      res.json(thesis || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET all theses
  app.get("/api/theses", async (_req, res) => {
    try {
      const all = await storage.getAllTheses();
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET all devils advocates
  app.get("/api/devils-advocates", async (_req, res) => {
    try {
      const all = await storage.getAllDevilsAdvocates();
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST generate thesis
  app.post("/api/thesis/:ticker/generate", async (req, res) => {
    try {
      const ticker = req.params.ticker;

      // Get holding
      const allHoldings = await storage.getAllHoldings();
      const holding = allHoldings.find((h) => h.ticker === ticker);
      if (!holding) return res.status(404).json({ error: "Holding not found" });

      // Get enrichment
      const enrichment = await storage.getEnrichment(ticker);

      // Get fair value inline
      let fairValueData: any = null;
      let price = 0;
      try {
        const quoteData = await fetchFmpQuote(ticker);
        price = Array.isArray(quoteData) && quoteData.length > 0 ? quoteData[0].price : quoteData?.price || 0;
        if (enrichment && price > 0) {
          fairValueData = computeFairValue(enrichment, holding, price);
        }
      } catch {}

      // Build prompt
      const companyName = enrichment?.company_name || ticker;
      const industry = enrichment?.industry || "N/A";
      const revenueGrowth = enrichment?.revenue_growth_5y != null ? enrichment.revenue_growth_5y.toFixed(1) : "N/A";
      const opMargin = enrichment?.operating_margin != null ? enrichment.operating_margin.toFixed(1) : "N/A";
      const roic = enrichment?.roic != null ? enrichment.roic.toFixed(1) : "N/A";
      const fcfMargin = enrichment?.fcf_margin != null ? enrichment.fcf_margin.toFixed(1) : "N/A";
      const netDebtEbitda = enrichment?.net_debt_ebitda != null ? enrichment.net_debt_ebitda.toFixed(1) : "N/A";
      const beta = enrichment?.beta != null ? enrichment.beta.toFixed(2) : "N/A";
      const peRatio = enrichment?.pe_ratio != null ? enrichment.pe_ratio.toFixed(1) : "N/A";

      const fvStr = fairValueData
        ? `Fair Value: $${fairValueData.fair_value.toFixed(2)} (current: $${price.toFixed(2)}, ${fairValueData.valuation_label})\n- Uncertainty: ${fairValueData.uncertainty_class}`
        : "Not available";

      const prompt = `You are an investment analyst writing a concise, structured thesis card for a personal portfolio tracker.
Be specific, analytical, and honest. Avoid generic statements.

Holding: ${ticker} (${companyName})
BDD Type: ${holding.bdd_type} (Builder=high growth, Engine=compounding quality, Grounder=defensive stability, Moonshot=speculative)
Sector: ${holding.sector} | Industry: ${industry}
Personal notes: ${holding.notes}

Fundamentals:
- Revenue growth 5yr: ${revenueGrowth}%
- Operating margin: ${opMargin}%
- ROIC: ${roic}%
- FCF margin: ${fcfMargin}%
- Net debt/EBITDA: ${netDebtEbitda}x
- Beta: ${beta}
- P/E: ${peRatio}x

Fair Value Assessment:
- ${fvStr}

Write a JSON response with exactly these fields:
{
  "summary": "2-3 sentence executive summary of the investment case",
  "why_own": ["reason 1", "reason 2", "reason 3"],
  "key_drivers": ["catalyst 1 with timeframe", "catalyst 2", "catalyst 3"],
  "risks": ["specific risk 1", "specific risk 2", "specific risk 3"],
  "break_conditions": ["condition that would make you sell 1", "condition 2"],
  "what_must_be_true": ["falsifiable condition 1", "falsifiable condition 2", "falsifiable condition 3"],
  "valuation_view": "one honest sentence on current price vs fair value"
}`;

      await groqRateLimit();

      const groq = new Groq({ apiKey: GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 2000,
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw);

      const thesisData = {
        ticker,
        summary: parsed.summary || "",
        why_own: JSON.stringify(parsed.why_own || []),
        key_drivers: JSON.stringify(parsed.key_drivers || []),
        risks: JSON.stringify(parsed.risks || []),
        break_conditions: JSON.stringify(parsed.break_conditions || []),
        what_must_be_true: JSON.stringify(parsed.what_must_be_true || []),
        valuation_view: parsed.valuation_view || "",
        generated_at: new Date().toISOString(),
        source: "ai",
      };

      const saved = await storage.upsertThesis(thesisData);
      res.json(saved);
    } catch (err: any) {
      console.error("Thesis generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE thesis
  app.delete("/api/thesis/:ticker", async (req, res) => {
    try {
      await storage.deleteThesis(req.params.ticker);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET devil's advocate
  app.get("/api/devils-advocate/:ticker", async (req, res) => {
    try {
      const da = await storage.getDevilsAdvocate(req.params.ticker);
      res.json(da || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST generate devil's advocate
  app.post("/api/devils-advocate/:ticker/generate", async (req, res) => {
    try {
      const ticker = req.params.ticker;

      // Require thesis to exist
      const thesis = await storage.getThesis(ticker);
      if (!thesis) return res.status(400).json({ error: "Thesis must exist before generating devil's advocate" });

      // Get holding + enrichment
      const allHoldings = await storage.getAllHoldings();
      const holding = allHoldings.find((h) => h.ticker === ticker);
      if (!holding) return res.status(404).json({ error: "Holding not found" });

      const enrichment = await storage.getEnrichment(ticker);

      // Get price + fair value
      let price = 0;
      let fairValueData: any = null;
      try {
        const quoteData = await fetchFmpQuote(ticker);
        price = Array.isArray(quoteData) && quoteData.length > 0 ? quoteData[0].price : quoteData?.price || 0;
        if (enrichment && price > 0) {
          fairValueData = computeFairValue(enrichment, holding, price);
        }
      } catch {}

      const companyName = enrichment?.company_name || ticker;
      const fvStr = fairValueData ? `$${fairValueData.fair_value.toFixed(2)}` : "N/A";
      const valLabel = fairValueData?.valuation_label || "N/A";

      const revenueGrowth = enrichment?.revenue_growth_5y != null ? enrichment.revenue_growth_5y.toFixed(1) + "%" : "N/A";
      const opMargin = enrichment?.operating_margin != null ? enrichment.operating_margin.toFixed(1) + "%" : "N/A";
      const roic = enrichment?.roic != null ? enrichment.roic.toFixed(1) + "%" : "N/A";
      const fcfMargin = enrichment?.fcf_margin != null ? enrichment.fcf_margin.toFixed(1) + "%" : "N/A";
      const peRatio = enrichment?.pe_ratio != null ? enrichment.pe_ratio.toFixed(1) + "x" : "N/A";
      const netDebtEbitda = enrichment?.net_debt_ebitda != null ? enrichment.net_debt_ebitda.toFixed(1) + "x" : "N/A";

      const whyOwn = JSON.parse(thesis.why_own || "[]").join(", ");
      const keyDrivers = JSON.parse(thesis.key_drivers || "[]").join(", ");

      const prompt = `You are a skeptical analyst stress-testing an investment thesis.
Find the strongest bear case. Be specific, contrarian, and reference actual numbers.

Holding: ${ticker} (${companyName})
Current price: $${price.toFixed(2)} | Fair Value: ${fvStr} | Valuation: ${valLabel}
Fundamentals: Revenue growth 5yr: ${revenueGrowth}, Operating margin: ${opMargin}, ROIC: ${roic}, FCF margin: ${fcfMargin}, P/E: ${peRatio}, Net debt/EBITDA: ${netDebtEbitda}

Bull thesis being challenged:
Summary: ${thesis.summary}
Why own: ${whyOwn}
Key drivers: ${keyDrivers}

Return JSON:
{
  "bear_headline": "one punchy bear case sentence",
  "counter_arguments": [
    {"argument": "specific argument against the thesis", "severity": "high|medium|low"},
    {"argument": "...", "severity": "..."},
    {"argument": "...", "severity": "..."}
  ],
  "blind_spots": ["thing the bull case is ignoring 1", "thing 2"],
  "worst_case_scenario": "specific description of how this position goes wrong, with rough magnitude",
  "conviction_challenge": "the single most important question a bull must answer",
  "verdict": "strong_bear|moderate_bear|minor_concerns"
}`;

      await groqRateLimit();

      const groq = new Groq({ apiKey: GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 2000,
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw);

      const daData = {
        ticker,
        bear_headline: parsed.bear_headline || "",
        counter_arguments: JSON.stringify(parsed.counter_arguments || []),
        blind_spots: JSON.stringify(parsed.blind_spots || []),
        worst_case_scenario: parsed.worst_case_scenario || "",
        conviction_challenge: parsed.conviction_challenge || "",
        verdict: parsed.verdict || "minor_concerns",
        generated_at: new Date().toISOString(),
      };

      const saved = await storage.upsertDevilsAdvocate(daData);
      res.json(saved);
    } catch (err: any) {
      console.error("Devil's advocate generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE devil's advocate
  app.delete("/api/devils-advocate/:ticker", async (req, res) => {
    try {
      await storage.deleteDevilsAdvocate(req.params.ticker);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Exchange Rate (USD → THB) ──
  let exchangeRateCache: { rate: number; cached_at: string } | null = null;
  let exchangeRateCachedAt = 0;
  const EXCHANGE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  app.get("/api/exchange-rate", async (_req, res) => {
    try {
      const now = Date.now();
      if (exchangeRateCache && now - exchangeRateCachedAt < EXCHANGE_CACHE_TTL) {
        return res.json({ ...exchangeRateCache, pair: "USD/THB" });
      }
      const data = await fetchFmpJson("fx");
      const pairs = Array.isArray(data) ? data : (data?.quotes || []);
      // Look for USDTHB or USD/THB
      const entry = pairs.find((p: any) =>
        p.ticker === "USDTHB" ||
        p.symbol === "USDTHB" ||
        (p.fromCurrency === "USD" && p.toCurrency === "THB") ||
        p.name === "USD/THB"
      );
      const rate = entry ? (entry.ask || entry.bid || entry.price || entry.rate || 33.5) : 33.5;
      exchangeRateCache = { rate: Number(rate), cached_at: new Date().toISOString() };
      exchangeRateCachedAt = now;
      res.json({ rate: Number(rate), pair: "USD/THB", cached_at: exchangeRateCache.cached_at });
    } catch (err: any) {
      // Fallback to approximate rate
      const fallback = { rate: 33.5, pair: "USD/THB", cached_at: new Date().toISOString() };
      res.json(fallback);
    }
  });

  // ── Buy Decision Layer ──
  const BDD_TARGETS: Record<string, number> = { engine: 0.45, grounder: 0.35, builder: 0.20, moonshot: 0.05 };

  app.get("/api/buy-decision", async (_req, res) => {
    try {
      const allHoldings = await storage.getAllHoldings();
      const allEnrichments = await storage.getAllEnrichments();
      const allTheses = await storage.getAllTheses();
      const allDAs = await storage.getAllDevilsAdvocates();

      // Get prices
      const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
      const priceMap: Record<string, number> = {};
      await Promise.all(tickers.map(async (ticker) => {
        try {
          const data = await fetchFmpQuote(ticker);
          if (Array.isArray(data) && data.length > 0) priceMap[ticker] = data[0].price || 0;
          else if (data?.price) priceMap[ticker] = data.price;
        } catch {}
      }));

      // Compute total market value per BDD sleeve
      let totalMktValue = 0;
      const sleeveValues: Record<string, number> = { engine: 0, grounder: 0, builder: 0, moonshot: 0 };
      for (const h of allHoldings) {
        const price = priceMap[h.ticker] || 0;
        const val = price * h.shares;
        totalMktValue += val;
        sleeveValues[h.bdd_type] = (sleeveValues[h.bdd_type] || 0) + val;
      }

      const thesisSet = new Set(allTheses.map((t) => t.ticker));
      const daSet = new Set(allDAs.map((d) => d.ticker));
      const enrichMap = new Map(allEnrichments.map((e) => [e.ticker, e]));

      // Get fair values
      const fvMap: Record<string, number> = {};
      for (const e of allEnrichments) {
        const h = allHoldings.find((h) => h.ticker === e.ticker);
        if (!h) continue;
        const price = priceMap[e.ticker] || 0;
        if (price > 0) {
          const fv = computeFairValue(e, h, price);
          fvMap[e.ticker] = fv.pfv_ratio;
        }
      }

      const results = allHoldings.map((h) => {
        const reasons: string[] = [];
        let score = 0;

        // Valuation score
        const pfv = fvMap[h.ticker];
        if (pfv !== undefined) {
          if (pfv < 0.75) { score += 2; reasons.push("Deep discount (P/FV < 0.75)"); }
          else if (pfv < 0.90) { score += 1; reasons.push("Discount (P/FV 0.75-0.90)"); }
          else if (pfv <= 1.10) { reasons.push("Fair value range"); }
          else if (pfv <= 1.25) { score -= 1; reasons.push("Slight premium (P/FV 1.10-1.25)"); }
          else { score -= 2; reasons.push("Rich valuation (P/FV > 1.25)"); }
        }

        // Thesis/DA bonus
        if (thesisSet.has(h.ticker)) { score += 1; reasons.push("Has thesis"); }
        if (daSet.has(h.ticker)) { score += 1; reasons.push("Has devil's advocate"); }

        // BDD fit
        const target = BDD_TARGETS[h.bdd_type] || 0;
        const actualWeight = totalMktValue > 0 ? (sleeveValues[h.bdd_type] || 0) / totalMktValue : 0;
        if (actualWeight < target * 0.8) { score += 1; reasons.push(`${h.bdd_type} sleeve underweight`); }
        else if (actualWeight > target * 1.2) { score -= 1; reasons.push(`${h.bdd_type} sleeve overweight`); }

        let badge = "Watch";
        let badgeClass = "amber";
        if (score >= 4) { badge = "Strong Buy"; badgeClass = "emerald"; }
        else if (score >= 2) { badge = "Buy"; badgeClass = "teal"; }
        else if (score === 0 || score === 1) { badge = "Watch"; badgeClass = "amber"; }
        else if (score === -1) { badge = "Review"; badgeClass = "orange"; }
        else { badge = "Trim"; badgeClass = "red"; }

        return { ticker: h.ticker, score, badge, badgeClass, reasons };
      });

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── WMBT (What Must Be True) ──
  app.get("/api/wmbt/:ticker", async (req, res) => {
    try {
      const items = await storage.getWmbtItems(req.params.ticker);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/wmbt/:ticker", async (req, res) => {
    try {
      const { condition, status = "unverified", notes = "" } = req.body;
      if (!condition) return res.status(400).json({ error: "condition required" });
      const item = await storage.createWmbtItem({
        ticker: req.params.ticker,
        condition,
        status,
        notes,
        updated_at: new Date().toISOString(),
      });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/wmbt/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const updated = await storage.updateWmbtItem(id, {
        ...req.body,
        updated_at: new Date().toISOString(),
      });
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/wmbt/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.deleteWmbtItem(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Capital Deployment Calculator ──
  app.post("/api/capital-deploy", async (req, res) => {
    try {
      const { cash } = req.body;
      if (!cash || cash <= 0) return res.status(400).json({ error: "cash must be > 0" });

      const allHoldings = await storage.getAllHoldings();
      const allEnrichments = await storage.getAllEnrichments();

      const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
      const priceMap: Record<string, number> = {};
      await Promise.all(tickers.map(async (t) => {
        try {
          const data = await fetchFmpQuote(t);
          if (Array.isArray(data) && data.length > 0) priceMap[t] = data[0].price || 0;
          else if (data?.price) priceMap[t] = data.price;
        } catch {}
      }));

      let totalMktValue = 0;
      const sleeveValues: Record<string, number> = { engine: 0, grounder: 0, builder: 0, moonshot: 0 };
      for (const h of allHoldings) {
        const val = (priceMap[h.ticker] || 0) * h.shares;
        totalMktValue += val;
        sleeveValues[h.bdd_type] = (sleeveValues[h.bdd_type] || 0) + val;
      }

      const enrichMap = new Map(allEnrichments.map((e) => [e.ticker, e]));
      const fvMap: Record<string, { pfv_ratio: number; fair_value: number }> = {};
      for (const e of allEnrichments) {
        const h = allHoldings.find((h) => h.ticker === e.ticker);
        if (!h) continue;
        const price = priceMap[e.ticker] || 0;
        if (price > 0) {
          const fv = computeFairValue(e, h, price);
          fvMap[e.ticker] = { pfv_ratio: fv.pfv_ratio, fair_value: fv.fair_value };
        }
      }

      // Compute gap scores
      const scored = allHoldings.map((h) => {
        const target = BDD_TARGETS[h.bdd_type] || 0;
        const actualBddWeight = totalMktValue > 0 ? (sleeveValues[h.bdd_type] || 0) / totalMktValue : 0;
        const pfv = fvMap[h.ticker]?.pfv_ratio ?? 1;
        const pfvDiscount = Math.max(0, 1 - pfv);
        const gapScore = (target - actualBddWeight) * pfvDiscount;
        const price = priceMap[h.ticker] || 0;
        const fv = fvMap[h.ticker];
        const reason = `${h.bdd_type} sleeve ${actualBddWeight < target ? "underweight" : "overweight"} (actual ${(actualBddWeight * 100).toFixed(1)}% vs target ${(target * 100).toFixed(0)}%); P/FV ${pfv.toFixed(2)} → discount ${(pfvDiscount * 100).toFixed(0)}%`;
        return { ticker: h.ticker, bdd_type: h.bdd_type, gapScore, price, fair_value: fv?.fair_value ?? 0, pfv_ratio: pfv, reason };
      }).filter((x) => x.gapScore > 0).sort((a, b) => b.gapScore - a.gapScore);

      const totalGap = scored.reduce((s, x) => s + x.gapScore, 0);
      const allocations = scored.map((x) => {
        const suggestedDollar = totalGap > 0 ? (x.gapScore / totalGap) * cash : 0;
        const sharesToBuy = x.price > 0 ? suggestedDollar / x.price : 0;
        return {
          ticker: x.ticker,
          bdd_type: x.bdd_type,
          suggested_dollar: Math.round(suggestedDollar * 100) / 100,
          shares_to_buy: Math.round(sharesToBuy * 1000) / 1000,
          current_price: Math.round(x.price * 100) / 100,
          fair_value: Math.round(x.fair_value * 100) / 100,
          pfv_ratio: Math.round(x.pfv_ratio * 1000) / 1000,
          reason: x.reason,
        };
      });

      res.json({ allocations, total_cash: cash, holdings_count: scored.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Price Alerts ──
  app.get("/api/alerts", async (_req, res) => {
    try {
      const all = await storage.getAllAlerts();
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/alerts", async (req, res) => {
    try {
      const { ticker, alert_type, target_value, label = "" } = req.body;
      if (!ticker || !alert_type || target_value == null) {
        return res.status(400).json({ error: "ticker, alert_type, target_value required" });
      }
      const alert = await storage.createAlert({
        ticker,
        alert_type,
        target_value: Number(target_value),
        label,
        triggered: false,
        triggered_at: null,
        created_at: new Date().toISOString(),
      });
      res.status(201).json(alert);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/alerts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.deleteAlert(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/alerts/check", async (_req, res) => {
    try {
      const untriggered = await storage.getUntriggeredAlerts();
      if (untriggered.length === 0) return res.json({ triggered: [] });

      // Get prices for relevant tickers
      const tickers = [...new Set(untriggered.map((a) => a.ticker))];
      const priceMap: Record<string, any> = {};
      await Promise.all(tickers.map(async (t) => {
        try {
          const data = await fetchFmpQuote(t);
          if (Array.isArray(data) && data.length > 0) priceMap[t] = data[0];
          else if (data) priceMap[t] = data;
        } catch {}
      }));

      const allHoldings = await storage.getAllHoldings();
      const holdingMap = new Map(allHoldings.map((h) => [h.ticker, h]));

      const triggered: any[] = [];
      const now = new Date().toISOString();

      for (const alert of untriggered) {
        const quote = priceMap[alert.ticker];
        if (!quote) continue;
        const price = quote.price || 0;
        const holding = holdingMap.get(alert.ticker);
        let fired = false;

        if (alert.alert_type === "above" && price >= alert.target_value) fired = true;
        else if (alert.alert_type === "below" && price <= alert.target_value) fired = true;
        else if (alert.alert_type === "pct_change" && holding) {
          const pctChange = holding.avg_cost > 0 ? ((price - holding.avg_cost) / holding.avg_cost) * 100 : 0;
          if (Math.abs(pctChange) >= alert.target_value) fired = true;
        }

        if (fired) {
          await storage.markAlertTriggered(alert.id, now);
          triggered.push({ ...alert, current_price: price, triggered_at: now });
        }
      }

      res.json({ triggered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Position Sizing Assistant ──
  app.post("/api/position-size", async (req, res) => {
    try {
      const { ticker, conviction, bdd_type } = req.body;
      if (!ticker || conviction == null || !bdd_type) {
        return res.status(400).json({ error: "ticker, conviction, bdd_type required" });
      }

      const allHoldings = await storage.getAllHoldings();
      const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
      const priceMap: Record<string, number> = {};
      await Promise.all(tickers.map(async (t) => {
        try {
          const data = await fetchFmpQuote(t);
          if (Array.isArray(data) && data.length > 0) priceMap[t] = data[0].price || 0;
          else if (data?.price) priceMap[t] = data.price;
        } catch {}
      }));

      // Also get price for new ticker if not in holdings
      if (!priceMap[ticker]) {
        try {
          const data = await fetchFmpQuote(ticker);
          if (Array.isArray(data) && data.length > 0) priceMap[ticker] = data[0].price || 0;
          else if (data?.price) priceMap[ticker] = data.price;
        } catch {}
      }

      let totalMktValue = 0;
      for (const h of allHoldings) {
        totalMktValue += (priceMap[h.ticker] || 0) * h.shares;
      }

      // Base mid % by BDD type
      const baseMid: Record<string, number> = {
        engine: 0.04,    // 4% mid of 3-5%
        grounder: 0.03,  // 3% mid of 2-4%
        builder: 0.0225, // 2.25% mid of 1.5-3%
        moonshot: 0.01,  // 1% mid of 0.5-1.5%
      };
      const base = baseMid[bdd_type] || 0.03;

      // Conviction multiplier
      const multMap: Record<number, number> = { 1: 0.5, 2: 0.75, 3: 1.0, 4: 1.25, 5: 1.5 };
      const mult = multMap[conviction] || 1.0;

      const suggestedPct = base * mult;
      const suggestedDollar = totalMktValue * suggestedPct;
      const currentPrice = priceMap[ticker] || 0;
      const shares = currentPrice > 0 ? suggestedDollar / currentPrice : 0;

      // Existing position info
      const existing = allHoldings.find((h) => h.ticker === ticker);
      let existingInfo: any = null;
      if (existing) {
        const exPrice = priceMap[ticker] || 0;
        const exValue = exPrice * existing.shares;
        const exWeight = totalMktValue > 0 ? exValue / totalMktValue : 0;
        const newTotalShares = existing.shares + shares;
        const newTotalCost = existing.shares * existing.avg_cost + shares * currentPrice;
        const newAvgCost = newTotalShares > 0 ? newTotalCost / newTotalShares : 0;
        const newTotalValue = exPrice * newTotalShares;
        const newWeight = (totalMktValue + suggestedDollar) > 0 ? newTotalValue / (totalMktValue + suggestedDollar) : 0;
        existingInfo = {
          current_shares: existing.shares,
          current_avg_cost: existing.avg_cost,
          current_value: Math.round(exValue * 100) / 100,
          current_weight_pct: Math.round(exWeight * 10000) / 100,
          new_avg_cost: Math.round(newAvgCost * 100) / 100,
          new_total_shares: Math.round(newTotalShares * 1000) / 1000,
          new_weight_pct: Math.round(newWeight * 10000) / 100,
        };
      }

      res.json({
        ticker,
        bdd_type,
        conviction,
        suggested_pct: Math.round(suggestedPct * 10000) / 100,
        suggested_dollar: Math.round(suggestedDollar * 100) / 100,
        shares_to_buy: Math.round(shares * 1000) / 1000,
        current_price: Math.round(currentPrice * 100) / 100,
        portfolio_value: Math.round(totalMktValue * 100) / 100,
        resulting_weight_pct: totalMktValue > 0 ? Math.round((suggestedDollar / totalMktValue) * 10000) / 100 : 0,
        existing: existingInfo,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Cost Basis Optimizer ──
  app.post("/api/cost-basis-calc", async (req, res) => {
    try {
      const { ticker, target_avg_cost } = req.body;
      if (!ticker || target_avg_cost == null) {
        return res.status(400).json({ error: "ticker and target_avg_cost required" });
      }

      const allHoldings = await storage.getAllHoldings();
      const holding = allHoldings.find((h) => h.ticker === ticker);
      if (!holding) return res.status(404).json({ error: "Holding not found" });

      const quoteData = await fetchFmpQuote(ticker);
      const currentPrice = Array.isArray(quoteData) && quoteData.length > 0
        ? quoteData[0].price || 0 : quoteData?.price || 0;

      const target = Number(target_avg_cost);

      if (target >= holding.avg_cost) {
        return res.status(400).json({ error: "Target avg cost must be below current avg cost" });
      }
      if (currentPrice >= target) {
        return res.status(400).json({ error: "Current price must be below target avg cost for averaging down" });
      }

      // Formula: shares_needed = (current_shares * (current_avg - target_avg)) / (target_avg - current_price)
      const sharesNeeded = (holding.shares * (holding.avg_cost - target)) / (target - currentPrice);
      const dollarCost = sharesNeeded * currentPrice;
      const newTotalShares = holding.shares + sharesNeeded;
      const newTotalCost = holding.shares * holding.avg_cost + sharesNeeded * currentPrice;
      const newAvgCost = newTotalShares > 0 ? newTotalCost / newTotalShares : 0;

      res.json({
        ticker,
        current_shares: holding.shares,
        current_avg_cost: holding.avg_cost,
        current_price: Math.round(currentPrice * 100) / 100,
        target_avg_cost: target,
        shares_needed: Math.round(sharesNeeded * 1000) / 1000,
        dollar_cost: Math.round(dollarCost * 100) / 100,
        new_avg_cost: Math.round(newAvgCost * 100) / 100,
        new_total_shares: Math.round(newTotalShares * 1000) / 1000,
        new_total_cost_basis: Math.round(newTotalCost * 100) / 100,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Export Routes ──
  app.get("/api/export/json", async (_req, res) => {
    try {
      const allHoldings = await storage.getAllHoldings();
      const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
      const priceMap: Record<string, any> = {};
      await Promise.all(tickers.map(async (t) => {
        try {
          const data = await fetchFmpQuote(t);
          if (Array.isArray(data) && data.length > 0) priceMap[t] = data[0];
          else if (data) priceMap[t] = data;
        } catch {}
      }));

      let totalMktValue = 0;
      const sleeveValues: Record<string, number> = {};
      const enrichedHoldings = allHoldings.map((h) => {
        const q = priceMap[h.ticker];
        const price = q?.price || 0;
        const mktValue = price * h.shares;
        const costBasis = h.avg_cost * h.shares;
        totalMktValue += mktValue;
        sleeveValues[h.bdd_type] = (sleeveValues[h.bdd_type] || 0) + mktValue;
        return { ...h, current_price: price, market_value: mktValue, cost_basis: costBasis,
          pnl: mktValue - costBasis, day_change_pct: q?.changesPercentage ?? 0 };
      });

      const allEnrichments = await storage.getAllEnrichments();
      const allTheses = await storage.getAllTheses();
      const fvResults: any[] = [];
      for (const e of allEnrichments) {
        const h = allHoldings.find((h) => h.ticker === e.ticker);
        if (!h) continue;
        const price = priceMap[e.ticker]?.price || 0;
        if (price > 0) fvResults.push(computeFairValue(e, h, price));
      }

      res.json({
        exported_at: new Date().toISOString(),
        total_market_value: Math.round(totalMktValue * 100) / 100,
        holdings: enrichedHoldings.map((h) => ({ ...h, weight_pct: totalMktValue > 0 ? Math.round((h.market_value / totalMktValue) * 10000) / 100 : 0 })),
        fair_values: fvResults,
        bdd_summary: Object.entries(sleeveValues).map(([type, value]) => ({
          type, value: Math.round(value * 100) / 100,
          weight_pct: totalMktValue > 0 ? Math.round((value / totalMktValue) * 10000) / 100 : 0,
          target_pct: (BDD_TARGETS[type] || 0) * 100,
        })),
        theses_count: allTheses.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/export/csv", async (_req, res) => {
    try {
      const allHoldings = await storage.getAllHoldings();
      const allEnrichments = await storage.getAllEnrichments();
      const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
      const priceMap: Record<string, any> = {};
      await Promise.all(tickers.map(async (t) => {
        try {
          const data = await fetchFmpQuote(t);
          if (Array.isArray(data) && data.length > 0) priceMap[t] = data[0];
          else if (data) priceMap[t] = data;
        } catch {}
      }));

      const enrichMap = new Map(allEnrichments.map((e) => [e.ticker, e]));
      let totalMktValue = 0;
      const rows = allHoldings.map((h) => {
        const q = priceMap[h.ticker];
        const price = q?.price || 0;
        const mktValue = price * h.shares;
        totalMktValue += mktValue;
        return { h, q, price, mktValue, costBasis: h.avg_cost * h.shares };
      });

      const headers = ["Ticker","Company","Shares","Avg Cost (USD)","Current Price (USD)","Market Value (USD)","P&L (USD)","P&L %","Day %","BDD Type","Sector","Weight %"];
      const csvRows = rows.map(({ h, q, price, mktValue, costBasis }) => {
        const pnl = mktValue - costBasis;
        const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
        const weight = totalMktValue > 0 ? (mktValue / totalMktValue) * 100 : 0;
        const company = enrichMap.get(h.ticker)?.company_name || h.ticker;
        return [
          h.ticker, company, h.shares.toFixed(4), h.avg_cost.toFixed(2), price.toFixed(2),
          mktValue.toFixed(2), pnl.toFixed(2), pnlPct.toFixed(2), (q?.changesPercentage ?? 0).toFixed(2),
          h.bdd_type, h.sector, weight.toFixed(2),
        ].map((v) => `"${v}"`).join(",");
      });

      const csv = [headers.join(","), ...csvRows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="portfolio-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Screenshot Import (Groq Vision) ──

  // Extract holdings from images via Groq vision
  app.post("/api/holdings/extract-screenshots", async (req, res) => {
    try {
      const { images, mode } = req.body as {
        images: { data: string; mimeType: string }[];
        mode: "portfolio" | "transaction";
      };
      if (!images || images.length === 0) {
        return res.status(400).json({ error: "No images provided" });
      }
      if (!GROQ_API_KEY) {
        return res.status(500).json({ error: "GROQ_API_KEY not configured" });
      }

      const groq = new Groq({ apiKey: GROQ_API_KEY });
      const importMode = mode || "portfolio";

      const imageMessages: any[] = images.map((img) => ({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.data}` },
      }));

      const systemPrompt = importMode === "portfolio"
        ? `You are a financial data extractor. You will receive screenshots from a brokerage app called Dime! showing the "My Assets" portfolio overview.

This is a scrollable list showing multiple holdings. Each holding row shows:
- Ticker symbol (e.g. SCHD, VOO, GOOGL)
- Weight percentage (e.g. 19.49%)
- Holding Value (USD)
- Current Price
- Price & ID Change %
- When expanded: Outstanding Shares, Cost per Share (USD), Total Cost (USD), Unrealized P/L

Extract ALL holdings visible across ALL screenshots. Multiple screenshots may overlap. A single screenshot may contain 3-6 holdings.

Return a JSON object:
{
  "holdings": [
    { "ticker": "SCHD", "shares": 300.485687, "avg_cost": 30.9534 }
  ]
}

Rules:
- "ticker" = exact ticker symbol (uppercase, e.g. "SCHD", "VOO", "BRK.B")
- "shares" = Outstanding Shares value. Exact decimal.
- "avg_cost" = Cost per Share (USD). Exact decimal.
- Extract EVERY visible holding, even partially visible at edges
- If expanded details not visible (no shares/cost shown), include with shares=0, avg_cost=0
- If same ticker in multiple screenshots, extract each time
- Do NOT invent data. Only extract what is clearly visible.
- Return ONLY valid JSON, no markdown.`
        : `You are a financial data extractor. You will receive screenshots from Dime! showing individual order confirmations.

Each shows a single transaction: "Buy/Sell [TICKER]", Executed Price (USD), Shares, USD Amount, date.

Return a JSON object:
{
  "holdings": [
    { "ticker": "SPGI", "shares": 0.2599213, "avg_cost": 419.55 }
  ]
}

Rules:
- "ticker" = exact ticker symbol (uppercase)
- "shares" = number of shares
- "avg_cost" = Executed Price in USD
- One entry per screenshot
- Do NOT invent data.
- Return ONLY valid JSON, no markdown.`;

      const completion = await groq.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: [
          { type: "text", text: systemPrompt },
          ...imageMessages,
        ]}],
        temperature: 0.1,
        max_tokens: 4000,
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let parsed: { holdings: { ticker: string; shares: number; avg_cost: number }[] };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(422).json({ error: "Failed to parse vision response", raw: cleaned });
      }

      const holdings = (parsed.holdings || []).map((h) => ({
        ticker: (h.ticker || "").toUpperCase(),
        shares: Number(h.shares) || 0,
        avg_cost: Number(h.avg_cost) || 0,
      }));

      res.json({ holdings });
    } catch (err: any) {
      console.error("Extract screenshots error:", err);
      res.status(500).json({ error: err.message || "Vision extraction failed" });
    }
  });

  // Build diff from accumulated holdings vs DB
  // Body: { holdings: [...], mode: "portfolio" | "transaction" }
  app.post("/api/holdings/diff-import", async (req, res) => {
    try {
      const { holdings: accumulated, mode } = req.body as {
        holdings: { ticker: string; shares: number; avg_cost: number }[];
        mode: "portfolio" | "transaction";
      };

      // Filter usable
      const usable = (accumulated || []).filter((h) => h.shares > 0 && h.avg_cost > 0);

      // Deduplicate by ticker (last one wins — user may re-scan a holding with better data)
      const deduped = new Map<string, typeof usable[0]>();
      for (const h of usable) {
        deduped.set(h.ticker.toUpperCase(), h);
      }

      const existing = await storage.getAllHoldings();
      const existingMap = new Map(existing.map((h) => [h.ticker.toUpperCase(), h]));

      if (mode === "transaction") {
        const diff = Array.from(deduped.values()).map((h) => {
          const ex = existingMap.get(h.ticker.toUpperCase());
          if (ex) {
            const totalShares = ex.shares + h.shares;
            const totalCost = ex.shares * ex.avg_cost + h.shares * h.avg_cost;
            return {
              ticker: ex.ticker, action: "update" as const,
              existing_shares: ex.shares, new_shares: totalShares,
              existing_avg_cost: ex.avg_cost, new_avg_cost: totalShares > 0 ? totalCost / totalShares : h.avg_cost,
              added_shares: h.shares, added_cost: h.avg_cost,
              notes: "Transaction merge", existing_id: ex.id,
            };
          }
          return {
            ticker: h.ticker, action: "create" as const,
            existing_shares: 0, new_shares: h.shares,
            existing_avg_cost: 0, new_avg_cost: h.avg_cost,
            added_shares: h.shares, added_cost: h.avg_cost,
            notes: "New from transaction", existing_id: null,
          };
        });
        return res.json({ diff, missing: [] });
      }

      // Portfolio mode
      const extractedKeys = new Set(Array.from(deduped.keys()));

      const diff = Array.from(deduped.values()).map((h) => {
        const ex = existingMap.get(h.ticker.toUpperCase());
        if (ex) {
          const noChange = Math.abs(h.shares - ex.shares) < 0.0001 && Math.abs(h.avg_cost - ex.avg_cost) < 0.01;
          return {
            ticker: ex.ticker, action: "update" as const,
            existing_shares: ex.shares, new_shares: h.shares,
            existing_avg_cost: ex.avg_cost, new_avg_cost: h.avg_cost,
            added_shares: h.shares - ex.shares, added_cost: h.avg_cost,
            notes: noChange ? "No change" : "Portfolio sync", existing_id: ex.id,
          };
        }
        return {
          ticker: h.ticker, action: "create" as const,
          existing_shares: 0, new_shares: h.shares,
          existing_avg_cost: 0, new_avg_cost: h.avg_cost,
          added_shares: h.shares, added_cost: h.avg_cost,
          notes: "New holding", existing_id: null,
        };
      });

      const missing = existing
        .filter((h) => !extractedKeys.has(h.ticker.toUpperCase()))
        .map((h) => ({
          ticker: h.ticker, action: "delete" as const,
          existing_shares: h.shares, existing_avg_cost: h.avg_cost,
          existing_id: h.id, notes: "Not in screenshots",
        }));

      diff.sort((a, b) => {
        if (a.notes === "No change" && b.notes !== "No change") return 1;
        if (a.notes !== "No change" && b.notes === "No change") return -1;
        return 0;
      });

      res.json({ diff, missing });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Apply import changes + optional deletions
  app.post("/api/holdings/apply-import", async (req, res) => {
    try {
      const { changes, deletions } = req.body as {
        changes: {
          ticker: string;
          action: "create" | "update";
          new_shares: number;
          new_avg_cost: number;
          existing_id: number | null;
        }[];
        deletions?: { existing_id: number }[];
      };

      const results: any[] = [];

      if (changes && changes.length > 0) {
        for (const c of changes) {
          if (c.action === "update" && c.existing_id != null) {
            const updated = await storage.updateHolding(c.existing_id, {
              shares: c.new_shares, avg_cost: c.new_avg_cost,
            });
            if (updated) results.push(updated);
          } else if (c.action === "create") {
            const created = await storage.createHolding({
              ticker: c.ticker.toUpperCase(),
              shares: c.new_shares, avg_cost: c.new_avg_cost,
              bdd_type: "engine", sector: "", notes: "Imported from screenshot",
            });
            results.push(created);
          }
        }
      }

      if (deletions && deletions.length > 0) {
        for (const d of deletions) {
          await storage.deleteHolding(d.existing_id);
        }
      }

      res.json({ applied: (changes?.length || 0) + (deletions?.length || 0), results });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Apply failed" });
    }
  });

  return httpServer;
}

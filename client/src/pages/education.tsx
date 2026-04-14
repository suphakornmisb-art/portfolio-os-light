import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  BarChart3,
  Clock,
  Target,
  Plus,
  AlertTriangle,
  Info,
  ArrowRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Holding {
  id: number;
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  current_price_usd: number;
  beta?: number;
}

interface Enrichment {
  ticker: string;
  dividend_yield?: number;
  beta?: number;
  sector?: string;
  pe_ratio?: number;
}

interface Transaction {
  id: number;
  ticker: string;
  action: string;
  shares: number;
  price_usd: number;
  tx_date: string;
  notes?: string;
  amount_usd?: number;
}

interface Snapshot {
  id: number;
  date: string;
  total_value: number;
  total_cost: number;
  deposits?: number;
  withdrawals?: number;
}

// ─── Static Data ─────────────────────────────────────────────────────────────

const ETF_EXPENSE_RATIOS: Record<string, { ratio: number; name: string; category: string }> = {
  VOO: { ratio: 0.0003, name: "Vanguard S&P 500", category: "US Large Cap" },
  VTI: { ratio: 0.0003, name: "Vanguard Total Market", category: "US Total Market" },
  SCHD: { ratio: 0.0006, name: "Schwab Dividend Equity", category: "Dividend" },
  QQQ: { ratio: 0.0020, name: "Invesco Nasdaq 100", category: "US Tech" },
  SPY: { ratio: 0.00095, name: "SPDR S&P 500", category: "US Large Cap" },
  IVV: { ratio: 0.0003, name: "iShares Core S&P 500", category: "US Large Cap" },
  VEA: { ratio: 0.0005, name: "Vanguard FTSE Developed", category: "International" },
  VWO: { ratio: 0.0008, name: "Vanguard FTSE EM", category: "Emerging Markets" },
  BND: { ratio: 0.0003, name: "Vanguard Total Bond", category: "Bonds" },
  AGG: { ratio: 0.0003, name: "iShares Core US Agg", category: "Bonds" },
  GLD: { ratio: 0.0040, name: "SPDR Gold Shares", category: "Commodities" },
  IAU: { ratio: 0.0025, name: "iShares Gold Trust", category: "Commodities" },
  ARKK: { ratio: 0.0075, name: "ARK Innovation", category: "Active Growth" },
  ARKG: { ratio: 0.0075, name: "ARK Genomic Revolution", category: "Active Growth" },
  ARKW: { ratio: 0.0075, name: "ARK Next Gen Internet", category: "Active Growth" },
  XLK: { ratio: 0.0010, name: "Tech Select SPDR", category: "Sector" },
  XLF: { ratio: 0.0010, name: "Financial Select SPDR", category: "Sector" },
  XLE: { ratio: 0.0010, name: "Energy Select SPDR", category: "Sector" },
  SOXX: { ratio: 0.0035, name: "iShares Semiconductor", category: "Sector" },
  VNQ: { ratio: 0.0012, name: "Vanguard Real Estate", category: "REIT" },
  BITO: { ratio: 0.0095, name: "ProShares Bitcoin Strategy", category: "Crypto" },
  QQQM: { ratio: 0.0015, name: "Invesco Nasdaq 100 Mini", category: "US Tech" },
  SCHG: { ratio: 0.0004, name: "Schwab US Large Growth", category: "US Growth" },
  VUG: { ratio: 0.0004, name: "Vanguard Growth ETF", category: "US Growth" },
  IWF: { ratio: 0.0019, name: "iShares Russell 1000 Growth", category: "US Growth" },
  DFAC: { ratio: 0.0018, name: "Dimensional US Core Equity 2", category: "Factor" },
  AVUV: { ratio: 0.0025, name: "Avantis US Small Value", category: "Factor" },
  COWZ: { ratio: 0.0049, name: "Pacer US Cash Cows 100", category: "Factor" },
};

const HISTORICAL_SHOCKS: Record<string, { equity: number; label: string; vix: number; recovery_months: number; lesson: string; rates_shock?: number }> = {
  "2008 GFC": {
    equity: -0.57,
    label: "S&P 500 −57% (Oct 2007–Mar 2009)",
    vix: 80.86,
    recovery_months: 49,
    lesson:
      "The banking system nearly collapsed. Companies with debt and weak cash flows were destroyed. Dividend cuts hit income-seeking investors.",
  },
  "2020 COVID": {
    equity: -0.34,
    label: "S&P 500 −34% (Feb 19–Mar 23, 2020)",
    vix: 82.69,
    recovery_months: 5,
    lesson:
      "The fastest bear market ever. Recovered in 5 months — but nobody knew that in real time. Holding through required conviction in your thesis.",
  },
  "2022 Rate Hike": {
    equity: -0.27,
    rates_shock: 4.25,
    label: "S&P 500 −27% (Jan–Oct 2022)",
    vix: 35,
    recovery_months: 18,
    lesson:
      "Rate hikes crushed long-duration growth stocks and bonds simultaneously. The 60/40 portfolio failed for the first time in decades.",
  },
};

const BENCHMARKS = [
  { id: "SP500", name: "S&P 500 (VOO)", returns: { "1Y": 10.2, "3Y": 9.8, "5Y": 14.3 } },
  { id: "NASDAQ", name: "Nasdaq 100 (QQQ)", returns: { "1Y": 13.5, "3Y": 8.2, "5Y": 18.6 } },
  { id: "DIVGROWTH", name: "Dividend Growth (SCHD)", returns: { "1Y": 7.1, "3Y": 11.2, "5Y": 12.8 } },
  { id: "INTL", name: "International (VEA)", returns: { "1Y": 5.8, "3Y": 4.2, "5Y": 6.1 } },
];

const SP500_REFERENCE = [
  { month: "2024-01", price: 4845 },
  { month: "2024-02", price: 5137 },
  { month: "2024-03", price: 5243 },
  { month: "2024-04", price: 5035 },
  { month: "2024-05", price: 5277 },
  { month: "2024-06", price: 5460 },
  { month: "2024-07", price: 5522 },
  { month: "2024-08", price: 5648 },
  { month: "2024-09", price: 5762 },
  { month: "2024-10", price: 5705 },
  { month: "2024-11", price: 5870 },
  { month: "2024-12", price: 5881 },
  { month: "2025-01", price: 5996 },
  { month: "2025-02", price: 5954 },
  { month: "2025-03", price: 5611 },
  { month: "2025-04", price: 5204 },
];

// ─── Shared Components ────────────────────────────────────────────────────────

function EducationBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 flex gap-3">
      <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-200/80 leading-relaxed">{children}</p>
    </div>
  );
}

function SectionCard({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {title && (
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-primary" />}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Info className="h-3 w-3 text-primary" />
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function fmtPct(n: number, decimals = 2) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

function fmtUsd(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

// ─── Tab 1: Total Return ──────────────────────────────────────────────────────

function TotalReturnTab({ holdings, enrichments }: { holdings: Holding[]; enrichments: Enrichment[] }) {
  const enrichMap = useMemo(() => {
    const m: Record<string, Enrichment> = {};
    enrichments.forEach((e) => (m[e.ticker] = e));
    return m;
  }, [enrichments]);

  const topDividend = useMemo(() => {
    return [...holdings]
      .map((h) => ({
        ticker: h.ticker,
        yield: enrichMap[h.ticker]?.dividend_yield ?? 0,
        value: h.shares * h.current_price_usd,
      }))
      .filter((h) => h.yield > 0)
      .sort((a, b) => b.yield - a.yield)
      .slice(0, 10);
  }, [holdings, enrichMap]);

  const maxYield = topDividend.length > 0 ? Math.max(...topDividend.map((h) => h.yield)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">True Total Return vs Price Return</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Understanding the full picture of your investment returns</p>
      </div>

      <EducationBox>
        Most brokerage apps only show price return — the change in stock price. True total return adds dividends
        received, FX impact, and fees. Over long periods, dividends can account for 40%+ of total equity returns.
      </EducationBox>

      {holdings.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No holdings yet</p>
          <p className="text-xs text-muted-foreground">Add holdings via the Portfolio tab to see return data.</p>
        </div>
      ) : (
        <>
          {/* Holdings table */}
          <SectionCard title="Return Components by Holding" icon={TrendingUp}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left pb-2 text-muted-foreground font-medium">Ticker</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium">Price Return</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium">Div. Yield</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium">Est. FX Impact</th>
                    <th className="text-left pb-2 text-muted-foreground font-medium pl-4">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const e = enrichMap[h.ticker];
                    const divYield = e?.dividend_yield ?? 0;
                    return (
                      <tr key={h.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="py-2 font-mono font-semibold text-foreground">{h.ticker}</td>
                        <td className="py-2 text-right font-mono text-muted-foreground">
                          <span className="text-[10px] italic">N/A</span>
                        </td>
                        <td className="py-2 text-right font-mono">
                          {divYield > 0 ? (
                            <span className="text-emerald-400">{divYield.toFixed(2)}%</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono text-muted-foreground">USD: 0%</td>
                        <td className="py-2 pl-4 text-muted-foreground text-[10px]">
                          Price + Dividends — requires tx history
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Price return requires snapshot history. Take daily snapshots in the Performance tab to track it.
              FX impact is 0% for USD-base investors; THB investors gain/lose the USD/THB rate change.
            </p>
          </SectionCard>

          {/* Dividend compounding explainer */}
          <SectionCard title="How Dividends Compound" icon={DollarSign}>
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                If you invest <span className="text-foreground font-mono">$10,000</span> with a{" "}
                <span className="text-emerald-400 font-mono">3%</span> dividend yield, reinvested annually:
              </p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="rounded bg-card border border-border p-2">
                  <div className="text-[10px] text-muted-foreground">After 10 years (price only, 0% growth)</div>
                  <div className="font-mono font-semibold text-foreground mt-1">$13,439</div>
                  <div className="text-[10px] text-muted-foreground">via dividend reinvestment alone</div>
                </div>
                <div className="rounded bg-card border border-emerald-500/20 p-2">
                  <div className="text-[10px] text-muted-foreground">Yield-on-cost after 10 years</div>
                  <div className="font-mono font-semibold text-emerald-400 mt-1">~4.03%</div>
                  <div className="text-[10px] text-muted-foreground">on original $10k invested</div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Even with zero price appreciation, dividends reinvested grow your income stream each year. Yield-on-cost rises because
                you're receiving the same % on a larger share count.
              </p>
            </div>

            {/* Dividend yield bar visualization */}
            {topDividend.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                  Top Dividend Yields in Your Portfolio
                </p>
                <div className="space-y-1.5">
                  {topDividend.map((h) => (
                    <div key={h.ticker} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-foreground w-12 shrink-0">{h.ticker}</span>
                      <div className="flex-1 bg-muted/30 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${(h.yield / maxYield) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-emerald-400 w-12 text-right shrink-0">
                        {h.yield.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Tab 2: Fee Drag ──────────────────────────────────────────────────────────

function FeeDragTab({ holdings }: { holdings: Holding[] }) {
  const etfHoldings = useMemo(() => {
    return holdings
      .filter((h) => ETF_EXPENSE_RATIOS[h.ticker])
      .map((h) => {
        const info = ETF_EXPENSE_RATIOS[h.ticker];
        const value = h.shares * h.current_price_usd;
        const annualDrag = value * info.ratio;
        // Wealth difference: value*(1+r)^10 with fees vs without
        const growthRate = 0.07;
        const withFees = value * Math.pow(1 + growthRate - info.ratio, 10);
        const withoutFees = value * Math.pow(1 + growthRate, 10);
        const tenYearDrag = withoutFees - withFees;
        return { ...h, ...info, value, annualDrag, tenYearDrag };
      });
  }, [holdings]);

  const totalAnnualDrag = etfHoldings.reduce((s, h) => s + h.annualDrag, 0);
  const totalValue = etfHoldings.reduce((s, h) => s + h.value, 0);

  function ratioColor(ratio: number) {
    if (ratio < 0.001) return "text-emerald-400";
    if (ratio <= 0.005) return "text-amber-400";
    return "text-red-400";
  }

  function ratioBadge(ratio: number) {
    if (ratio < 0.001) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (ratio <= 0.005) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-red-500/10 text-red-400 border-red-500/20";
  }

  // 10-year compounding viz: $100k at 7% with/without fees for representative ETF
  const vizBase = totalValue || 100000;
  const vizWithFees = vizBase * Math.pow(1 + 0.07 - (totalAnnualDrag / Math.max(totalValue, 1)), 10);
  const vizWithout = vizBase * Math.pow(1.07, 10);
  const vizMax = vizWithout;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">ETF Expense Ratio & Fee Drag</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Silent return killers hiding in your fund holdings</p>
      </div>

      <EducationBox>
        Expense ratios are silent killers of returns. A fund charging 0.75% costs 25× more than one charging 0.03%.
        Over 20 years on $100,000, the difference can exceed $100,000 in wealth.
      </EducationBox>

      {etfHoldings.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No recognized ETFs in portfolio</p>
          <p className="text-xs text-muted-foreground">
            Fee drag analysis applies to ETF holdings. Add ETFs like VOO, QQQ, ARKK to see their cost impact.
          </p>
        </div>
      ) : (
        <>
          <SectionCard title="ETF Fee Analysis" icon={DollarSign}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left pb-2 text-muted-foreground font-medium">Ticker</th>
                    <th className="text-left pb-2 text-muted-foreground font-medium">Fund</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium">Expense Ratio</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium">Value</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium">Annual Drag</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium">10-Yr Drag</th>
                  </tr>
                </thead>
                <tbody>
                  {etfHoldings.map((h) => (
                    <tr key={h.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="py-2 font-mono font-semibold text-foreground">{h.ticker}</td>
                      <td className="py-2 text-muted-foreground">
                        <div>{h.name}</div>
                        <div className="text-[10px] text-muted-foreground/60">{h.category}</div>
                      </td>
                      <td className="py-2 text-right">
                        <span className={`font-mono font-medium ${ratioColor(h.ratio)}`}>
                          {(h.ratio * 100).toFixed(3)}%
                        </span>
                        <Badge
                          variant="outline"
                          className={`ml-1.5 text-[9px] px-1 py-0 border ${ratioBadge(h.ratio)}`}
                        >
                          {h.ratio < 0.001 ? "cheap" : h.ratio <= 0.005 ? "moderate" : "expensive"}
                        </Badge>
                      </td>
                      <td className="py-2 text-right font-mono text-foreground">{fmtUsd(h.value)}</td>
                      <td className="py-2 text-right font-mono text-amber-400">{fmtUsd(h.annualDrag)}/yr</td>
                      <td className="py-2 text-right font-mono text-red-400">{fmtUsd(h.tenYearDrag)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td colSpan={4} className="pt-2 text-xs font-semibold text-foreground">
                      Total
                    </td>
                    <td className="pt-2 text-right font-mono text-amber-400 font-semibold">
                      {fmtUsd(totalAnnualDrag)}/yr
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>

          {/* 10-year compounding visualization */}
          <SectionCard title="10-Year Wealth Erosion (7% gross return)" icon={TrendingDown}>
            <p className="text-xs text-muted-foreground">
              Based on your current ETF holdings value of{" "}
              <span className="font-mono text-foreground">{fmtUsd(totalValue)}</span> growing at 7% annually.
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Without fees</span>
                  <span className="font-mono text-emerald-400">{fmtUsd(vizWithout)}</span>
                </div>
                <div className="h-5 bg-muted/30 rounded overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded" style={{ width: "100%" }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>With current fees ({((totalAnnualDrag / Math.max(totalValue, 1)) * 100).toFixed(3)}% blended)</span>
                  <span className="font-mono text-amber-400">{fmtUsd(vizWithFees)}</span>
                </div>
                <div className="h-5 bg-muted/30 rounded overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded"
                    style={{ width: `${(vizWithFees / vizMax) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Fee drag over 10 years:{" "}
                <span className="font-mono text-red-400">{fmtUsd(vizWithout - vizWithFees)}</span> in foregone wealth
              </p>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Tab 3: Stress Sim ────────────────────────────────────────────────────────

function StressSimTab({ holdings, enrichments }: { holdings: Holding[]; enrichments: Enrichment[] }) {
  const [selectedScenario, setSelectedScenario] = useState<string>("2008 GFC");

  const enrichMap = useMemo(() => {
    const m: Record<string, Enrichment> = {};
    enrichments.forEach((e) => (m[e.ticker] = e));
    return m;
  }, [enrichments]);

  const scenario = HISTORICAL_SHOCKS[selectedScenario];

  const impactedHoldings = useMemo(() => {
    return holdings
      .map((h) => {
        const beta = enrichMap[h.ticker]?.beta ?? h.beta ?? 1.0;
        const cappedBeta = Math.min(beta, 2.5);
        const shock = scenario.equity * cappedBeta;
        const value = h.shares * h.current_price_usd;
        const loss = value * shock;
        return { ticker: h.ticker, value, beta: cappedBeta, shock, loss };
      })
      .sort((a, b) => a.loss - b.loss);
  }, [holdings, enrichMap, scenario]);

  const totalValue = impactedHoldings.reduce((s, h) => s + h.value, 0);
  const totalLoss = impactedHoldings.reduce((s, h) => s + h.loss, 0);
  const portfolioPctLoss = totalValue > 0 ? (totalLoss / totalValue) * 100 : 0;

  const top5Impacted = impactedHoldings.slice(0, 5);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">How Would Your Portfolio Have Fared?</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Historical crisis shocks applied to your current holdings</p>
      </div>

      <EducationBox>
        This simulator applies historical crisis shocks to your current portfolio composition. It's not a prediction
        — it's a learning tool to understand your exposure under different conditions.
      </EducationBox>

      {/* Scenario buttons */}
      <div className="flex gap-2 flex-wrap">
        {Object.keys(HISTORICAL_SHOCKS).map((key) => (
          <button
            key={key}
            onClick={() => setSelectedScenario(key)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors border ${
              selectedScenario === key
                ? "bg-red-500/20 border-red-500/40 text-red-300"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Scenario context */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-sm font-semibold text-foreground">{selectedScenario}</span>
        </div>
        <p className="text-xs text-muted-foreground">{scenario.label}</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Peak VIX</div>
            <div className="font-mono font-semibold text-red-400 text-base">{scenario.vix.toFixed(0)}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Recovery</div>
            <div className="font-mono font-semibold text-amber-400 text-base">{scenario.recovery_months} mo</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Market Drop</div>
            <div className="font-mono font-semibold text-red-400 text-base">
              {(scenario.equity * 100).toFixed(0)}%
            </div>
          </div>
        </div>
        <div className="rounded bg-card/60 border border-border/40 p-2">
          <p className="text-xs text-muted-foreground leading-relaxed">{scenario.lesson}</p>
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No holdings to simulate</p>
          <p className="text-xs text-muted-foreground">Add holdings to run the stress test.</p>
        </div>
      ) : (
        <>
          {/* Portfolio impact summary */}
          <SectionCard title="Estimated Portfolio Impact" icon={TrendingDown}>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-border bg-muted/20 p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Estimated Drawdown
                </div>
                <div className="font-mono text-xl font-semibold text-red-400">
                  {portfolioPctLoss.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground">{fmtUsd(Math.abs(totalLoss))} loss</div>
              </div>
              <div className="rounded border border-border bg-muted/20 p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Portfolio Value After
                </div>
                <div className="font-mono text-xl font-semibold text-foreground">
                  {fmtUsd(totalValue + totalLoss)}
                </div>
                <div className="text-[10px] text-muted-foreground">from {fmtUsd(totalValue)}</div>
              </div>
            </div>
          </SectionCard>

          {/* Top 5 most impacted */}
          <SectionCard title="Most Impacted Holdings" icon={AlertTriangle}>
            <div className="space-y-2">
              {top5Impacted.map((h) => (
                <div key={h.ticker} className="flex items-center gap-3">
                  <span className="font-mono text-xs text-foreground w-14 shrink-0">{h.ticker}</span>
                  <div className="flex-1 bg-muted/30 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: `${Math.abs(h.shock) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-red-400 w-16 text-right shrink-0">
                    {(h.shock * 100).toFixed(1)}%
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground w-16 text-right shrink-0">
                    β {h.beta.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Shock = market drop × beta (capped at 2.5). Higher beta = amplified moves.
            </p>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Tab 4: Efficient Frontier ────────────────────────────────────────────────

function EfficientFrontierTab({ holdings, enrichments }: { holdings: Holding[]; enrichments: Enrichment[] }) {
  const enrichMap = useMemo(() => {
    const m: Record<string, Enrichment> = {};
    enrichments.forEach((e) => (m[e.ticker] = e));
    return m;
  }, [enrichments]);

  // Portfolio volatility proxy
  const totalValue = holdings.reduce((s, h) => s + h.shares * h.current_price_usd, 0);
  const weightedBeta = useMemo(() => {
    if (totalValue === 0) return 1.0;
    return holdings.reduce((s, h) => {
      const w = (h.shares * h.current_price_usd) / totalValue;
      const beta = enrichMap[h.ticker]?.beta ?? h.beta ?? 1.0;
      return s + w * beta;
    }, 0);
  }, [holdings, enrichMap, totalValue]);

  const portfolioVol = weightedBeta * 15; // approx, market vol ~15%

  // Reference points: [volatility%, return%]
  const REFERENCE = [
    { label: "Cash", x: 0, y: 5, color: "#64748b" },
    { label: "Bonds", x: 10, y: 6, color: "#3b82f6" },
    { label: "Diversified Equity", x: 15, y: 10, color: "#0cd4a0" },
    { label: "Concentrated Equity", x: 25, y: 12, color: "#f59e0b" },
    { label: "Growth/Speculative", x: 35, y: 15, color: "#ef4444" },
  ];

  // Chart layout
  const W = 500;
  const H = 260;
  const PAD = { l: 48, r: 20, t: 20, b: 36 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const xMax = 42;
  const yMin = 3;
  const yMax = 18;

  const toX = (v: number) => PAD.l + (v / xMax) * cW;
  const toY = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * cH;

  // Frontier curve points
  const frontierPoints = [
    [0, 4.5], [5, 5.5], [10, 6.5], [15, 9], [20, 11.5], [25, 13], [30, 14.5], [35, 15.5], [40, 16],
  ];
  const frontierPath = frontierPoints
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${toX(x)},${toY(y)}`)
    .join(" ");

  const portfolioDot = { x: toX(portfolioVol), y: toY(11) }; // estimated return 11%

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Risk vs Return — Where Does Your Portfolio Sit?</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Understanding diversification and the efficient frontier</p>
      </div>

      <EducationBox>
        The efficient frontier shows the maximum expected return for each level of risk. A portfolio "on the frontier"
        is optimally diversified. Understanding where you sit helps you see whether you're taking appropriate risk.
      </EducationBox>

      {/* CSS frontier chart */}
      <div className="rounded-lg border border-border bg-card p-4 overflow-x-auto">
        <p className="text-[10px] text-muted-foreground mb-3 font-medium uppercase tracking-wider">
          Conceptual Risk-Return Map (Volatility % vs Expected Return %)
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-full h-auto" style={{ minHeight: 180 }}>
          {/* Grid lines */}
          {[4, 6, 8, 10, 12, 14, 16].map((y) => (
            <g key={y}>
              <line x1={PAD.l} y1={toY(y)} x2={W - PAD.r} y2={toY(y)} stroke="hsl(220,10%,16%)" strokeWidth="0.5" />
              <text x={PAD.l - 4} y={toY(y) + 3} textAnchor="end" fill="hsl(215,10%,45%)" fontSize="8" fontFamily="monospace">
                {y}%
              </text>
            </g>
          ))}
          {[0, 10, 20, 30, 40].map((x) => (
            <g key={x}>
              <line x1={toX(x)} y1={PAD.t} x2={toX(x)} y2={H - PAD.b} stroke="hsl(220,10%,16%)" strokeWidth="0.5" />
              <text x={toX(x)} y={H - PAD.b + 12} textAnchor="middle" fill="hsl(215,10%,45%)" fontSize="8" fontFamily="monospace">
                {x}%
              </text>
            </g>
          ))}

          {/* Axis labels */}
          <text x={W / 2} y={H - 2} textAnchor="middle" fill="hsl(215,10%,52%)" fontSize="9" fontFamily="monospace">
            Volatility (Risk)
          </text>
          <text
            x={12}
            y={H / 2}
            textAnchor="middle"
            fill="hsl(215,10%,52%)"
            fontSize="9"
            fontFamily="monospace"
            transform={`rotate(-90 12 ${H / 2})`}
          >
            Return
          </text>

          {/* Efficient frontier curve */}
          <path d={frontierPath} fill="none" stroke="#0cd4a0" strokeWidth="2" strokeDasharray="6 3" opacity="0.6" />

          {/* Reference points */}
          {REFERENCE.map((r) => (
            <g key={r.label}>
              <circle cx={toX(r.x)} cy={toY(r.y)} r="5" fill={r.color} opacity="0.8" />
              <text
                x={toX(r.x)}
                y={toY(r.y) - 8}
                textAnchor="middle"
                fill={r.color}
                fontSize="8"
                fontFamily="monospace"
                fontWeight="600"
              >
                {r.label}
              </text>
            </g>
          ))}

          {/* Your portfolio dot */}
          {holdings.length > 0 && (
            <g>
              <circle cx={portfolioDot.x} cy={portfolioDot.y} r="7" fill="#f59e0b" stroke="hsl(220,13%,9%)" strokeWidth="2" />
              <text
                x={portfolioDot.x}
                y={portfolioDot.y - 10}
                textAnchor="middle"
                fill="#f59e0b"
                fontSize="8"
                fontFamily="monospace"
                fontWeight="700"
              >
                Your Portfolio
              </text>
              <text
                x={portfolioDot.x}
                y={portfolioDot.y + 18}
                textAnchor="middle"
                fill="hsl(215,10%,52%)"
                fontSize="7"
                fontFamily="monospace"
              >
                β={weightedBeta.toFixed(2)}, ~{portfolioVol.toFixed(0)}% vol
              </text>
            </g>
          )}

          {/* Legend */}
          <line x1={PAD.l + 10} y1={PAD.t + 8} x2={PAD.l + 30} y2={PAD.t + 8} stroke="#0cd4a0" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.6" />
          <text x={PAD.l + 34} y={PAD.t + 11} fill="hsl(215,10%,52%)" fontSize="8" fontFamily="monospace">
            Efficient Frontier
          </text>
        </svg>
      </div>

      {/* Beta contributions */}
      {holdings.length > 0 && (
        <SectionCard title="Beta Contribution by Holding" icon={Activity}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-muted-foreground font-medium">Ticker</th>
                  <th className="text-right pb-2 text-muted-foreground font-medium">Beta</th>
                  <th className="text-right pb-2 text-muted-foreground font-medium">Weight</th>
                  <th className="text-right pb-2 text-muted-foreground font-medium">Beta Contribution</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const beta = enrichMap[h.ticker]?.beta ?? h.beta ?? 1.0;
                  const w = totalValue > 0 ? (h.shares * h.current_price_usd) / totalValue : 0;
                  const contribution = w * beta;
                  return (
                    <tr key={h.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="py-2 font-mono text-foreground">{h.ticker}</td>
                      <td className={`py-2 text-right font-mono ${beta > 1.5 ? "text-red-400" : beta > 1 ? "text-amber-400" : "text-emerald-400"}`}>
                        {beta.toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-mono text-muted-foreground">{(w * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right font-mono text-foreground">{contribution.toFixed(3)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border">
                  <td colSpan={3} className="pt-2 text-xs font-semibold text-foreground">
                    Portfolio Beta
                  </td>
                  <td className="pt-2 text-right font-mono font-semibold text-primary">{weightedBeta.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Education cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard title="What is beta?">
          Beta measures how much a stock moves relative to the market (S&P 500). Beta 1.0 = moves with market.
          Beta 1.5 = 50% more volatile. Beta 0.5 = half as volatile.
        </InfoCard>
        <InfoCard title="Efficient Frontier">
          Nobel Prize concept by Harry Markowitz (1952). The frontier shows portfolios that maximize return for a
          given level of risk. Portfolios below the curve are sub-optimal.
        </InfoCard>
        <InfoCard title="Diversification">
          Holding multiple uncorrelated assets reduces portfolio volatility without proportionally sacrificing
          return. This is the only "free lunch" in investing.
        </InfoCard>
      </div>
    </div>
  );
}

// ─── Tab 5: Contributions ─────────────────────────────────────────────────────

function ContributionsTab({ transactions }: { transactions: Transaction[] }) {
  const { toast } = useToast();
  const [contribDate, setContribDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [contribAmount, setContribAmount] = useState("");
  const [contribNotes, setContribNotes] = useState("");

  const addContribMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/transactions", {
        ticker: "CASH",
        action: "contribution",
        shares: 0,
        price_usd: 0,
        amount_usd: parseFloat(contribAmount),
        tx_date: contribDate,
        notes: contribNotes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contribution logged" });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setContribAmount("");
      setContribNotes("");
    },
    onError: () => {
      toast({ title: "Failed to log contribution", variant: "destructive" });
    },
  });

  const contributions = useMemo(
    () => transactions.filter((t) => t.action === "contribution").sort((a, b) => b.tx_date.localeCompare(a.tx_date)),
    [transactions],
  );

  const buys = useMemo(
    () => transactions.filter((t) => t.action === "buy").sort((a, b) => a.tx_date.localeCompare(b.tx_date)),
    [transactions],
  );

  // Monthly contribution chart data
  const monthlyContribs = useMemo(() => {
    const m: Record<string, number> = {};
    contributions.forEach((t) => {
      const mo = t.tx_date.slice(0, 7);
      m[mo] = (m[mo] || 0) + (t.amount_usd ?? 0);
    });
    return Object.entries(m)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);
  }, [contributions]);

  const maxMonthlyContrib = monthlyContribs.length > 0 ? Math.max(...monthlyContribs.map(([, v]) => v)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Your Investment Contribution History</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Track your savings discipline and dollar-cost averaging</p>
      </div>

      <EducationBox>
        Consistent investing — "paying yourself first" — is one of the most powerful wealth-building habits. This tab
        tracks your monthly contributions and shows whether you're on pace toward your goals.
      </EducationBox>

      {/* Log contribution form */}
      <SectionCard title="Log a Contribution" icon={Plus}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Date</label>
            <input
              type="date"
              value={contribDate}
              onChange={(e) => setContribDate(e.target.value)}
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Amount (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={contribAmount}
              onChange={(e) => setContribAmount(e.target.value)}
              placeholder="1000.00"
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Notes (optional)</label>
            <input
              type="text"
              value={contribNotes}
              onChange={(e) => setContribNotes(e.target.value)}
              placeholder="Monthly DCA..."
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => addContribMutation.mutate()}
          disabled={!contribAmount || isNaN(parseFloat(contribAmount)) || addContribMutation.isPending}
          className="mt-2 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          {addContribMutation.isPending ? "Logging..." : "Log Contribution"}
        </Button>
      </SectionCard>

      {/* Monthly bar chart */}
      {monthlyContribs.length > 0 && (
        <SectionCard title="Monthly Contributions (Last 12 Months)" icon={BarChart3}>
          <div className="space-y-1.5">
            {monthlyContribs.map(([month, amount]) => (
              <div key={month} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground w-16 shrink-0">{month.slice(5)}</span>
                <div className="flex-1 bg-muted/30 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full flex items-center justify-end pr-1.5 transition-all"
                    style={{ width: `${(amount / maxMonthlyContrib) * 100}%` }}
                  >
                    <span className="text-[9px] font-mono text-background font-semibold">{fmtUsd(amount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Contribution timeline */}
      {contributions.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <Clock className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">No contributions logged yet</p>
          <p className="text-xs text-muted-foreground">Use the form above to start tracking your investment contributions.</p>
        </div>
      ) : (
        <SectionCard title="Contribution Timeline" icon={Clock}>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {contributions.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-1.5 border-b border-border/30">
                <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                <span className="font-mono text-[10px] text-muted-foreground w-24 shrink-0">{t.tx_date}</span>
                <span className="font-mono text-xs font-semibold text-primary">{fmtUsd(t.amount_usd ?? 0)}</span>
                {t.notes && <span className="text-[10px] text-muted-foreground truncate">{t.notes}</span>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* DCA education */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoCard title="Dollar-Cost Averaging (DCA)">
          Investing a fixed amount regularly — regardless of price — means you buy more shares when prices are low
          and fewer when prices are high. This automatically reduces your average cost over time.
        </InfoCard>
        <InfoCard title="Pay Yourself First">
          Setting up automatic transfers before discretionary spending removes the temptation to skip months. The
          power of consistency compounds over decades, not years.
        </InfoCard>
      </div>

      {/* Buy history */}
      {buys.length > 0 && (
        <SectionCard title="Your Buy Transaction History" icon={TrendingUp}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-muted-foreground font-medium">Date</th>
                  <th className="text-left pb-2 text-muted-foreground font-medium">Ticker</th>
                  <th className="text-right pb-2 text-muted-foreground font-medium">Shares</th>
                  <th className="text-right pb-2 text-muted-foreground font-medium">Price</th>
                  <th className="text-right pb-2 text-muted-foreground font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {buys.map((t) => (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="py-1.5 font-mono text-muted-foreground">{t.tx_date}</td>
                    <td className="py-1.5 font-mono font-semibold text-foreground">{t.ticker}</td>
                    <td className="py-1.5 text-right font-mono text-foreground">{t.shares}</td>
                    <td className="py-1.5 text-right font-mono text-foreground">{fmtUsd(t.price_usd)}</td>
                    <td className="py-1.5 text-right font-mono text-primary">{fmtUsd(t.shares * t.price_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Tab 6: Buy Timing ────────────────────────────────────────────────────────

function BuyTimingTab({ transactions }: { transactions: Transaction[] }) {
  const buys = useMemo(
    () => transactions.filter((t) => t.action === "buy").sort((a, b) => a.tx_date.localeCompare(b.tx_date)),
    [transactions],
  );

  // Group by month
  const monthlyBuys = useMemo(() => {
    const m: Record<string, { total: number; count: number }> = {};
    buys.forEach((t) => {
      const mo = t.tx_date.slice(0, 7);
      if (!m[mo]) m[mo] = { total: 0, count: 0 };
      m[mo].total += t.shares * t.price_usd;
      m[mo].count += 1;
    });
    return m;
  }, [buys]);

  const monthlyBuysArr = Object.entries(monthlyBuys).sort(([a], [b]) => a.localeCompare(b));
  const maxMonthly = monthlyBuysArr.length > 0 ? Math.max(...monthlyBuysArr.map(([, v]) => v.total)) : 1;

  // SP500 lookup
  const sp500Map = useMemo(() => {
    const m: Record<string, number> = {};
    SP500_REFERENCE.forEach((r) => (m[r.month] = r.price));
    return m;
  }, []);

  // Insights
  const totalBuys = buys.length;
  const totalInvested = buys.reduce((s, t) => s + t.shares * t.price_usd, 0);
  const avgMonthly = monthlyBuysArr.length > 0 ? totalInvested / monthlyBuysArr.length : 0;
  const busiestMonth = monthlyBuysArr.length > 0 ? monthlyBuysArr.reduce((a, b) => (b[1].total > a[1].total ? b : a))[0] : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Your Buy Timing Patterns</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Behavioral patterns in your investment timing</p>
      </div>

      <EducationBox>
        Understanding when you tend to buy helps identify behavioral patterns. Research shows most investors buy after
        markets rise (buying high) rather than after dips (buying low). Your own data tells your story.
      </EducationBox>

      {buys.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No transactions logged yet.</p>
          <p className="text-xs text-muted-foreground mb-4">
            Use the Screenshot Import tool to import your Dime! order confirmations — they'll appear here automatically.
          </p>
          <Link href="/tools/import">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors">
              Go to Screenshot Import
              <ArrowRight className="h-3 w-3" />
            </button>
          </Link>
        </div>
      ) : (
        <>
          {/* Insights summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Buys", value: totalBuys.toString(), color: "text-primary" },
              { label: "Total Invested", value: fmtUsd(totalInvested), color: "text-foreground" },
              { label: "Avg / Month", value: fmtUsd(avgMonthly), color: "text-foreground" },
              { label: "Busiest Month", value: busiestMonth ?? "—", color: "text-amber-400" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</div>
                <div className={`font-mono font-semibold text-sm ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Monthly buy chart with S&P 500 overlay */}
          <SectionCard title="Monthly Investment vs S&P 500 Level" icon={BarChart3}>
            <div className="space-y-1.5">
              {monthlyBuysArr.map(([month, data]) => {
                const sp = sp500Map[month];
                return (
                  <div key={month} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground w-16 shrink-0">{month.slice(5)}</span>
                    <div className="flex-1 bg-muted/30 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all"
                        style={{ width: `${(data.total / maxMonthly) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-primary w-14 text-right shrink-0">{fmtUsd(data.total)}</span>
                    {sp && (
                      <span className="font-mono text-[10px] text-muted-foreground w-14 text-right shrink-0">
                        S&P {sp.toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Bars show your invested amount per month. S&P 500 reference shows market level at time of purchase.
            </p>
          </SectionCard>
        </>
      )}

      {/* Education cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard title="Recency Bias">
          Investors over-weight recent events. After a big market rally, buying feels safe. After a crash, buying
          feels terrifying — which is exactly backwards from rational behavior.
        </InfoCard>
        <InfoCard title="Dollar-Cost Averaging">
          By investing fixed amounts on a schedule, you remove timing emotions entirely. You'll sometimes buy at
          peaks, sometimes at troughs — and average out to a reasonable entry.
        </InfoCard>
        <InfoCard title="Time in Market">
          Studies consistently show that missing the 10 best days in any given decade dramatically reduces returns.
          Staying invested matters more than when you invest.
        </InfoCard>
      </div>
    </div>
  );
}

// ─── Tab 7: Benchmarks ────────────────────────────────────────────────────────

function computePortfolioReturn(snapshots: Snapshot[]): {
  allTime: number | null;
  period: string;
  hasEnoughData: boolean;
} {
  if (snapshots.length < 2) return { allTime: null, period: "N/A", hasEnoughData: false };
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first.total_cost || first.total_cost === 0) return { allTime: null, period: "N/A", hasEnoughData: false };
  const allTime = ((last.total_value - first.total_cost) / first.total_cost) * 100;
  const period = `${first.date} → ${last.date}`;
  return { allTime, period, hasEnoughData: true };
}

function BenchmarksTab({ snapshots }: { snapshots: Snapshot[] }) {
  const { allTime: portfolioReturnAllTime, period, hasEnoughData } = useMemo(
    () => computePortfolioReturn(snapshots),
    [snapshots],
  );

  // Use all-time return as the primary portfolio return for alpha calculation
  const portfolioReturn = portfolioReturnAllTime;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Your Portfolio vs The Benchmarks</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Context for evaluating your investment performance</p>
      </div>

      <EducationBox>
        A benchmark is a standard to measure performance against. The S&P 500 (VOO) is the most common benchmark for
        US equity investors. Outperforming doesn't always mean better decisions — it could be luck, timing, or sector
        concentration.
      </EducationBox>

      {/* Disclaimer */}
      <div className="rounded-lg border border-border bg-muted/20 p-3 flex gap-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Benchmark returns shown are approximate annualized historical averages for educational reference. Your
          actual performance is computed from your snapshot history.
          {hasEnoughData && (
            <span className="text-primary ml-1">Period: {period}</span>
          )}
        </p>
      </div>

      {/* Comparison table */}
      <SectionCard title="Benchmark Comparison" icon={Target}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left pb-2 text-muted-foreground font-medium">Benchmark</th>
                <th className="text-right pb-2 text-muted-foreground font-medium">1Y Return</th>
                <th className="text-right pb-2 text-muted-foreground font-medium">3Y Ann.</th>
                <th className="text-right pb-2 text-muted-foreground font-medium">5Y Ann.</th>
                <th className="text-right pb-2 text-muted-foreground font-medium">Alpha vs Your Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARKS.map((b) => {
                const alpha = hasEnoughData && portfolioReturn !== null
                  ? portfolioReturn - b.returns["1Y"]
                  : null;
                return (
                  <tr key={b.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="py-2 font-medium text-foreground">{b.name}</td>
                    <td className="py-2 text-right font-mono text-emerald-400">+{b.returns["1Y"]}%</td>
                    <td className="py-2 text-right font-mono text-foreground">+{b.returns["3Y"]}%</td>
                    <td className="py-2 text-right font-mono text-foreground">+{b.returns["5Y"]}%</td>
                    <td className="py-2 text-right font-mono">
                      {alpha !== null ? (
                        <span className={alpha >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {fmtPct(alpha)} alpha
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Your portfolio row */}
              <tr className="bg-primary/5 border-t-2 border-primary/20">
                <td className="py-2 font-semibold text-primary">Your Portfolio</td>
                <td className="py-2 text-right font-mono">
                  {hasEnoughData && portfolioReturn !== null ? (
                    <span className={portfolioReturn >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {fmtPct(portfolioReturn)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-[10px] italic">—</span>
                  )}
                </td>
                <td className="py-2 text-right font-mono text-muted-foreground text-[10px] italic" colSpan={3}>
                  {!hasEnoughData ? (
                    <Link href="/performance">
                      <span className="text-primary hover:underline cursor-pointer">Add snapshots in Performance tab</span>
                    </Link>
                  ) : (
                    `All-time return (${period})`
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Visual bar comparison */}
      <SectionCard title="Return Comparison" icon={BarChart3}>
        {(() => {
          const items = [
            ...BENCHMARKS.map((b) => ({ name: b.name, value: b.returns["1Y"], isPortfolio: false })),
            ...(hasEnoughData && portfolioReturn !== null
              ? [{ name: "Your Portfolio", value: portfolioReturn, isPortfolio: true }]
              : []),
          ].sort((a, b) => b.value - a.value);

          const allValues = items.map((i) => Math.abs(i.value));
          const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;

          return items.map((item) => (
            <div key={item.name} className="flex items-center gap-2 mb-2">
              <span
                className={`text-[10px] w-36 shrink-0 truncate ${
                  item.isPortfolio ? "text-primary font-semibold" : "text-muted-foreground"
                }`}
              >
                {item.name}
              </span>
              <div className="flex-1 bg-muted/30 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    item.isPortfolio ? "bg-amber-500" : "bg-primary/60"
                  }`}
                  style={{ width: `${(Math.abs(item.value) / maxVal) * 100}%` }}
                />
              </div>
              <span
                className={`font-mono text-[10px] w-14 text-right shrink-0 ${
                  item.isPortfolio
                    ? item.value >= 0 ? "text-amber-400" : "text-red-400"
                    : "text-emerald-400"
                }`}
              >
                {item.value >= 0 ? "+" : ""}{item.value.toFixed(1)}%
              </span>
            </div>
          ));
        })()}
        {!hasEnoughData && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Your portfolio bar will appear once you have 2+ snapshots in the Performance tab.
          </p>
        )}
      </SectionCard>

      {/* Education cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard title="What is Alpha?">
          Alpha is the excess return above a benchmark. If your portfolio returns 12% and the S&P 500 returns 10%,
          your alpha is +2%. Consistent positive alpha is extremely rare.
        </InfoCard>
        <InfoCard title="Benchmark Selection Matters">
          Comparing a small-cap value portfolio to the S&P 500 is misleading. The right benchmark matches your
          portfolio's investment style, geography, and risk level.
        </InfoCard>
        <InfoCard title="Survivorship Bias">
          Historical benchmark returns look better than reality partly because failed funds are removed from the
          index. Index funds capture all survivors — active funds don't.
        </InfoCard>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EducationPage() {
  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
    staleTime: 60000,
  });

  const { data: enrichments = [], isLoading: enrichLoading } = useQuery<Enrichment[]>({
    queryKey: ["/api/enrichments"],
    staleTime: 60000,
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
    staleTime: 60000,
  });

  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery<Snapshot[]>({
    queryKey: ["/api/snapshots"],
    staleTime: 60000,
  });

  const isLoading = holdingsLoading || enrichLoading || txLoading || snapshotsLoading;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Investor Education
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Learn from your portfolio — no advice, just data</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      ) : (
        <Tabs defaultValue="total-return" className="w-full">
          <TabsList className="flex w-full h-auto flex-wrap gap-0.5 bg-muted/40 p-1 rounded-lg">
            <TabsTrigger value="total-return" className="text-[11px] px-2.5 py-1.5 flex-1 min-w-[80px]">
              Total Return
            </TabsTrigger>
            <TabsTrigger value="fee-drag" className="text-[11px] px-2.5 py-1.5 flex-1 min-w-[80px]">
              Fee Drag
            </TabsTrigger>
            <TabsTrigger value="stress-sim" className="text-[11px] px-2.5 py-1.5 flex-1 min-w-[80px]">
              Stress Sim
            </TabsTrigger>
            <TabsTrigger value="frontier" className="text-[11px] px-2.5 py-1.5 flex-1 min-w-[80px]">
              Efficient Frontier
            </TabsTrigger>
            <TabsTrigger value="contributions" className="text-[11px] px-2.5 py-1.5 flex-1 min-w-[80px]">
              Contributions
            </TabsTrigger>
            <TabsTrigger value="buy-timing" className="text-[11px] px-2.5 py-1.5 flex-1 min-w-[80px]">
              Buy Timing
            </TabsTrigger>
            <TabsTrigger value="benchmarks" className="text-[11px] px-2.5 py-1.5 flex-1 min-w-[80px]">
              Benchmarks
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="total-return" className="mt-0">
              <TotalReturnTab holdings={holdings} enrichments={enrichments} />
            </TabsContent>

            <TabsContent value="fee-drag" className="mt-0">
              <FeeDragTab holdings={holdings} />
            </TabsContent>

            <TabsContent value="stress-sim" className="mt-0">
              <StressSimTab holdings={holdings} enrichments={enrichments} />
            </TabsContent>

            <TabsContent value="frontier" className="mt-0">
              <EfficientFrontierTab holdings={holdings} enrichments={enrichments} />
            </TabsContent>

            <TabsContent value="contributions" className="mt-0">
              <ContributionsTab transactions={transactions} />
            </TabsContent>

            <TabsContent value="buy-timing" className="mt-0">
              <BuyTimingTab transactions={transactions} />
            </TabsContent>

            <TabsContent value="benchmarks" className="mt-0">
              <BenchmarksTab snapshots={snapshots} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}

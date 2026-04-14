import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Holding, Enrichment, Snapshot } from "@shared/schema";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtUSD, fmtPct, pnlColor, BDD_COLORS, bddLabel } from "@/components/format";
import { BarChart3, TrendingUp, TrendingDown, Award, Info } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PriceMap = Record<string, { price?: number }>;
type EnrichmentMap = Record<string, Enrichment>;

type Period = "alltime" | "1m" | "3m" | "6m";

// ── Constants ─────────────────────────────────────────────────────────────────

const SP500_RETURN_1Y = 10.2;
const NASDAQ_RETURN_1Y = 13.5;

const PERIODS: { id: Period; label: string }[] = [
  { id: "alltime", label: "All Time" },
  { id: "1m", label: "1M" },
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtContrib(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function clamp0to100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ── Bar Component ─────────────────────────────────────────────────────────────

function AttributionBar({
  label,
  returnPct,
  weight,
  contribution,
  color,
  maxReturn,
}: {
  label: string;
  returnPct: number;
  weight: number;
  contribution: number;
  color: string;
  maxReturn: number;
}) {
  const barWidth = maxReturn !== 0 ? clamp0to100((Math.abs(returnPct) / Math.abs(maxReturn)) * 100) : 0;
  const isPositive = returnPct >= 0;

  return (
    <div className="flex items-center gap-3 py-2 text-xs">
      <div className="w-20 shrink-0 font-mono font-semibold text-foreground truncate" title={label}>
        {label}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="flex-1 h-4 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span className={`w-16 text-right font-mono font-semibold shrink-0 ${pnlColor(returnPct)}`}>
          {fmtPct(returnPct)}
        </span>
      </div>
      <div className="w-16 shrink-0 text-right">
        <span className="text-muted-foreground font-mono">{weight.toFixed(1)}%</span>
      </div>
      <div className="w-20 shrink-0 text-right">
        <span className={`font-mono font-medium ${pnlColor(contribution)}`}>
          {fmtContrib(contribution)}
        </span>
      </div>
    </div>
  );
}

// ── Sector color helper ───────────────────────────────────────────────────────

const SECTOR_COLORS = [
  "bg-blue-500/60",
  "bg-emerald-500/60",
  "bg-purple-500/60",
  "bg-amber-500/60",
  "bg-cyan-500/60",
  "bg-rose-500/60",
  "bg-indigo-500/60",
  "bg-teal-500/60",
];

function sectorColor(idx: number): string {
  return SECTOR_COLORS[idx % SECTOR_COLORS.length];
}

// ── Attribution Table Sort ────────────────────────────────────────────────────

type SortKey = "contribution" | "returnPct" | "weight";

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AttributionPage() {
  const { formatAmount } = useCurrency();
  const [period, setPeriod] = useState<Period>("alltime");
  const [sortKey, setSortKey] = useState<SortKey>("contribution");

  // Data fetching
  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  const { data: prices = {} as PriceMap, isLoading: pricesLoading } = useQuery<PriceMap>({
    queryKey: ["/api/prices"],
    staleTime: 60000,
  });

  const { data: enrichmentsRaw = [], isLoading: enrichLoading } = useQuery<Enrichment[]>({
    queryKey: ["/api/enrichments"],
    staleTime: 300000,
  });

  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery<Snapshot[]>({
    queryKey: ["/api/snapshots"],
    staleTime: 60000,
  });

  // Build enrichment map
  const enrichmentMap = useMemo<EnrichmentMap>(() => {
    const m: EnrichmentMap = {};
    for (const e of enrichmentsRaw) m[e.ticker] = e;
    return m;
  }, [enrichmentsRaw]);

  // ── Enriched holdings with per-holding contribution ────────────────────────
  const enriched = useMemo(() => {
    const totalMktValue = holdings.reduce((s, h) => {
      const price = prices[h.ticker]?.price ?? 0;
      return s + price * h.shares;
    }, 0);

    return holdings.map((h) => {
      const currentPrice = prices[h.ticker]?.price ?? 0;
      const mktValue = currentPrice * h.shares;
      const costBasis = h.avg_cost * h.shares;
      const returnPct = costBasis > 0 ? ((mktValue - costBasis) / costBasis) * 100 : 0;
      const weight = totalMktValue > 0 ? (mktValue / totalMktValue) * 100 : 0;
      const contribution = (weight / 100) * returnPct;
      const sector = h.sector || enrichmentMap[h.ticker]?.industry || "Other";

      return {
        ...h,
        currentPrice,
        mktValue,
        costBasis,
        returnPct,
        weight,
        contribution,
        sector,
      };
    });
  }, [holdings, prices, enrichmentMap]);

  const totalMktValue = useMemo(() => enriched.reduce((s, h) => s + h.mktValue, 0), [enriched]);
  const totalCostBasis = useMemo(() => enriched.reduce((s, h) => s + h.costBasis, 0), [enriched]);
  const totalPnl = totalMktValue - totalCostBasis;
  const totalReturnPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;
  const totalContrib = useMemo(() => enriched.reduce((s, h) => s + h.contribution, 0), [enriched]);

  // Alpha vs S&P 500
  const alpha = totalReturnPct - SP500_RETURN_1Y;
  const isOutperforming = alpha >= 0;

  // ── BDD Sleeve Attribution ─────────────────────────────────────────────────
  const bddSleeves = useMemo(() => {
    const groups: Record<string, typeof enriched> = {};
    for (const h of enriched) {
      const key = h.bdd_type || "engine";
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    }

    return Object.entries(groups).map(([bdd, items]) => {
      const sleeveValue = items.reduce((s, h) => s + h.mktValue, 0);
      const sleeveCost = items.reduce((s, h) => s + h.costBasis, 0);
      const sleeveReturn = sleeveCost > 0 ? ((sleeveValue - sleeveCost) / sleeveCost) * 100 : 0;
      const sleeveWeight = totalMktValue > 0 ? (sleeveValue / totalMktValue) * 100 : 0;
      const sleeveContrib = (sleeveWeight / 100) * sleeveReturn;
      return { bdd, sleeveValue, sleeveReturn, sleeveWeight, sleeveContrib };
    }).sort((a, b) => Math.abs(b.sleeveContrib) - Math.abs(a.sleeveContrib));
  }, [enriched, totalMktValue]);

  // ── Sector Attribution ─────────────────────────────────────────────────────
  const sectorGroups = useMemo(() => {
    const groups: Record<string, typeof enriched> = {};
    for (const h of enriched) {
      const key = h.sector || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    }

    return Object.entries(groups).map(([sector, items], idx) => {
      const secValue = items.reduce((s, h) => s + h.mktValue, 0);
      const secCost = items.reduce((s, h) => s + h.costBasis, 0);
      const secReturn = secCost > 0 ? ((secValue - secCost) / secCost) * 100 : 0;
      const secWeight = totalMktValue > 0 ? (secValue / totalMktValue) * 100 : 0;
      const secContrib = (secWeight / 100) * secReturn;
      return { sector, secValue, secReturn, secWeight, secContrib, colorIdx: idx };
    }).sort((a, b) => Math.abs(b.secContrib) - Math.abs(a.secContrib));
  }, [enriched, totalMktValue]);

  // ── Top Contributors & Detractors ──────────────────────────────────────────
  const sortedByContrib = useMemo(
    () => [...enriched].sort((a, b) => b.contribution - a.contribution),
    [enriched],
  );
  const topContributors = sortedByContrib.slice(0, 5).filter((h) => h.contribution > 0);
  const topDetractors = [...sortedByContrib].reverse().slice(0, 5).filter((h) => h.contribution < 0);

  // ── Sorted holdings table ──────────────────────────────────────────────────
  const sortedHoldings = useMemo(() => {
    const copy = [...enriched];
    switch (sortKey) {
      case "contribution": return copy.sort((a, b) => b.contribution - a.contribution);
      case "returnPct": return copy.sort((a, b) => b.returnPct - a.returnPct);
      case "weight": return copy.sort((a, b) => b.weight - a.weight);
      default: return copy;
    }
  }, [enriched, sortKey]);

  // Max values for bar scaling
  const maxBddReturn = Math.max(...bddSleeves.map((s) => Math.abs(s.sleeveReturn)), 1);
  const maxSectorReturn = Math.max(...sectorGroups.map((s) => Math.abs(s.secReturn)), 1);

  const isLoading = holdingsLoading || pricesLoading || enrichLoading || snapshotsLoading;
  const requiresMoreSnapshots = period !== "alltime";

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            Performance Attribution
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Understand where your returns come from
          </p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                period === p.id
                  ? "bg-primary/20 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`button-period-${p.id}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Period disclaimer */}
      {requiresMoreSnapshots && (
        <div className="rounded-lg border border-border bg-card/60 p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
          Period-based returns require granular snapshot data. Showing All Time (cost basis) view
          instead. Add daily snapshots on the Performance tab to unlock period filtering.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      ) : (
        <>
          {/* ── Section 1: Portfolio Summary ─────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium text-foreground">Portfolio Summary</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-md bg-muted/40 px-3 py-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Return</div>
                <div className={`font-mono text-base font-semibold ${pnlColor(totalReturnPct)}`}>
                  {fmtPct(totalReturnPct)}
                </div>
              </div>
              <div className="rounded-md bg-muted/40 px-3 py-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Cost Basis</div>
                <div className="font-mono text-sm font-semibold text-foreground">{formatAmount(totalCostBasis, true)}</div>
              </div>
              <div className="rounded-md bg-muted/40 px-3 py-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Current Value</div>
                <div className="font-mono text-sm font-semibold text-foreground">{formatAmount(totalMktValue, true)}</div>
              </div>
              <div className="rounded-md bg-muted/40 px-3 py-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">P&L</div>
                <div className={`font-mono text-sm font-semibold ${pnlColor(totalPnl)}`}>
                  {totalPnl >= 0 ? "+" : ""}{formatAmount(totalPnl, true)}
                </div>
              </div>
            </div>

            {/* Benchmark comparison inline */}
            <div className={`flex items-center justify-between rounded-md px-3 py-2 border ${
              isOutperforming
                ? "border-emerald-500/30 bg-emerald-500/8"
                : "border-red-500/20 bg-red-500/8"
            }`}>
              <div className="text-xs text-muted-foreground">
                vs S&P 500 benchmark (+{SP500_RETURN_1Y}%)
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-sm font-semibold ${pnlColor(alpha)}`}>
                  Alpha: {alpha >= 0 ? "+" : ""}{alpha.toFixed(2)}%
                </span>
                <span className={`flex items-center gap-1 text-[11px] font-medium ${
                  isOutperforming ? "text-emerald-400" : "text-red-400"
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {isOutperforming ? "Outperforming" : "Underperforming"}
                </span>
              </div>
            </div>
          </div>

          {/* ── Section 2: BDD Sleeve Attribution ─────────────────────────── */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3">
              <h3 className="text-sm font-medium text-foreground">BDD Sleeve Attribution</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Return and portfolio weight by Builder / Grounder / Engine type
              </p>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-wider mb-1 px-0">
              <div className="w-20 shrink-0">Sleeve</div>
              <div className="flex-1">Return</div>
              <div className="w-16 text-right">Weight</div>
              <div className="w-20 text-right">Contribution</div>
            </div>

            <div className="divide-y divide-border/40">
              {bddSleeves.map(({ bdd, sleeveReturn, sleeveWeight, sleeveContrib }) => {
                const colors = BDD_COLORS[bdd] ?? BDD_COLORS["engine"];
                return (
                  <AttributionBar
                    key={bdd}
                    label={bddLabel(bdd)}
                    returnPct={sleeveReturn}
                    weight={sleeveWeight}
                    contribution={sleeveContrib}
                    color={`${colors.bg} ${colors.text.replace("text-", "bg-").replace("400", "500/60")}`}
                    maxReturn={maxBddReturn}
                  />
                );
              })}
            </div>
          </div>

          {/* ── Section 3: Sector Attribution ─────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3">
              <h3 className="text-sm font-medium text-foreground">Sector Attribution</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Return decomposed by sector — each sector's contribution to total portfolio return
              </p>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              <div className="w-20 shrink-0">Sector</div>
              <div className="flex-1">Return</div>
              <div className="w-16 text-right">Weight</div>
              <div className="w-20 text-right">Contribution</div>
            </div>

            <div className="divide-y divide-border/40">
              {sectorGroups.map(({ sector, secReturn, secWeight, secContrib, colorIdx }) => (
                <AttributionBar
                  key={sector}
                  label={sector.length > 10 ? sector.slice(0, 10) + "…" : sector}
                  returnPct={secReturn}
                  weight={secWeight}
                  contribution={secContrib}
                  color={sectorColor(colorIdx)}
                  maxReturn={maxSectorReturn}
                />
              ))}
            </div>
          </div>

          {/* ── Section 4: Top Contributors & Detractors ───────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Contributors */}
            <div className="rounded-lg border border-emerald-500/20 bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-medium text-foreground">Top Contributors</h3>
              </div>
              {topContributors.length === 0 ? (
                <p className="text-xs text-muted-foreground">No positive contributors yet.</p>
              ) : (
                <div className="space-y-2">
                  {topContributors.map((h, i) => (
                    <div key={h.ticker} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono w-3">{i + 1}.</span>
                        <span className="font-mono font-semibold text-foreground">{h.ticker}</span>
                        <span className="text-emerald-400 font-mono">{fmtPct(h.returnPct)}</span>
                      </div>
                      <span className="font-mono font-semibold text-emerald-400">
                        → {fmtContrib(h.contribution)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detractors */}
            <div className="rounded-lg border border-red-500/20 bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="h-4 w-4 text-red-400" />
                <h3 className="text-sm font-medium text-foreground">Top Detractors</h3>
              </div>
              {topDetractors.length === 0 ? (
                <p className="text-xs text-muted-foreground">No negative contributors.</p>
              ) : (
                <div className="space-y-2">
                  {topDetractors.map((h, i) => (
                    <div key={h.ticker} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono w-3">{i + 1}.</span>
                        <span className="font-mono font-semibold text-foreground">{h.ticker}</span>
                        <span className="text-red-400 font-mono">{fmtPct(h.returnPct)}</span>
                      </div>
                      <span className="font-mono font-semibold text-red-400">
                        → {fmtContrib(h.contribution)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Section 5: Full Holdings Attribution Table ─────────────────── */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">Full Holdings Attribution</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Per-holding weight, return, and contribution to portfolio total
                </p>
              </div>
              {/* Sort controls */}
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground mr-1">Sort:</span>
                {(["contribution", "returnPct", "weight"] as SortKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSortKey(k)}
                    className={`px-2 py-1 rounded transition-colors ${
                      sortKey === k
                        ? "bg-primary/20 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`button-sort-${k}`}
                  >
                    {k === "contribution" ? "Contribution" : k === "returnPct" ? "Return" : "Weight"}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Ticker</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">BDD</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Sector</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Weight %</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Return %</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Contribution %</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.map((h) => {
                    const bddColors = BDD_COLORS[h.bdd_type] ?? BDD_COLORS["engine"];
                    return (
                      <tr
                        key={h.id}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                        data-testid={`row-attr-${h.ticker}`}
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-semibold text-foreground">{h.ticker}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${bddColors.bg} ${bddColors.text}`}>
                            {bddLabel(h.bdd_type).slice(0, 3)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-muted-foreground truncate max-w-[80px] block" title={h.sector}>
                            {h.sector?.slice(0, 10) || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {h.weight.toFixed(1)}%
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-medium ${pnlColor(h.returnPct)}`}>
                          {fmtPct(h.returnPct)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-semibold ${pnlColor(h.contribution)}`}>
                          {fmtContrib(h.contribution)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td className="px-4 py-2.5 font-medium text-foreground text-xs" colSpan={3}>Portfolio Total</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground text-xs">100.0%</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold text-xs ${pnlColor(totalReturnPct)}`}>
                      {fmtPct(totalReturnPct)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold text-xs ${pnlColor(totalContrib)}`}>
                      {fmtContrib(totalContrib)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Section 6: Benchmark Comparison ───────────────────────────── */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Award className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-medium text-foreground">Benchmark Comparison</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Left: comparison table */}
              <div className="space-y-2">
                {[
                  { label: "Your Portfolio", value: totalReturnPct, highlight: true },
                  { label: "S&P 500 (est. 1Y)", value: SP500_RETURN_1Y, highlight: false },
                  { label: "Nasdaq 100 (est. 1Y)", value: NASDAQ_RETURN_1Y, highlight: false },
                  { label: `Alpha vs S&P`, value: alpha, highlight: true, isAlpha: true },
                ].map(({ label, value, highlight, isAlpha }) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between py-2 border-b border-border/40 last:border-0 ${
                      highlight ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="text-xs">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-sm font-semibold ${pnlColor(value)}`}>
                        {value >= 0 ? "+" : ""}{value.toFixed(2)}%
                      </span>
                      {isAlpha && (
                        <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          isOutperforming
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {isOutperforming ? "Outperforming" : "Underperforming"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: visual bar */}
              <div className="rounded-md bg-muted/40 p-3 space-y-3">
                {[
                  { label: "Your Portfolio", value: totalReturnPct, color: "bg-indigo-500/70" },
                  { label: "S&P 500", value: SP500_RETURN_1Y, color: "bg-slate-400/50" },
                  { label: "Nasdaq 100", value: NASDAQ_RETURN_1Y, color: "bg-cyan-500/50" },
                ].map(({ label, value, color }) => {
                  const maxV = Math.max(
                    Math.abs(totalReturnPct),
                    SP500_RETURN_1Y,
                    NASDAQ_RETURN_1Y,
                    1,
                  );
                  const w = clamp0to100((Math.abs(value) / maxV) * 100);
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">{label}</span>
                        <span className={`font-mono font-semibold ${pnlColor(value)}`}>
                          {value >= 0 ? "+" : ""}{value.toFixed(2)}%
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color}`}
                          style={{ width: `${w}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
              Your return is calculated from cost basis (all-time since inception). For time-weighted
              return by period, add daily snapshots in the Performance tab.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

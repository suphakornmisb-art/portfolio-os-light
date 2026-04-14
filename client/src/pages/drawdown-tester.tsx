import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, AlertTriangle, Lightbulb, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/contexts/CurrencyContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Holding {
  id: number;
  ticker: string;
  shares: number;
  avg_cost: number;
  bdd_type: string;
}

interface Enrichment {
  ticker: string;
  beta?: number | null;
}

interface PriceData {
  price?: number;
  [key: string]: unknown;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_DROPS = [-20, -30, -40, -50] as const;
type PresetDrop = (typeof PRESET_DROPS)[number];

const RECOVERY_TIMES = [
  { drop: -20, months: 7, note: "avg ~7 months to recover" },
  { drop: -30, months: 18, note: "avg ~18 months to recover" },
  { drop: -40, months: 36, note: "avg ~36 months to recover" },
  { drop: -50, months: 49, note: "avg ~49 months to recover (2008 took ~4 years)" },
];

const BDD_LABELS: Record<string, string> = {
  builder: "Builder",
  grounder: "Grounder",
  engine: "Engine",
};

function bddLabel(bdd: string) {
  return BDD_LABELS[bdd] ?? bdd;
}

// ─── Beta badge ────────────────────────────────────────────────────────────────

function BetaBadge({ beta }: { beta: number }) {
  if (beta > 1.5) {
    return (
      <Badge variant="outline" className="text-[9px] px-1 py-0 border bg-red-500/10 text-red-400 border-red-500/20">
        High β
      </Badge>
    );
  }
  if (beta >= 1.0) {
    return (
      <Badge variant="outline" className="text-[9px] px-1 py-0 border bg-amber-500/10 text-amber-400 border-amber-500/20">
        Mid β
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] px-1 py-0 border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
      Low β
    </Badge>
  );
}

// ─── Drop color ───────────────────────────────────────────────────────────────

function dropColor(appliedDrop: number): string {
  const abs = Math.abs(appliedDrop);
  if (abs > 40) return "text-red-500";
  if (abs >= 25) return "text-orange-400";
  return "text-amber-400";
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DrawdownTesterPage() {
  const { formatAmount } = useCurrency();

  const [selectedDrop, setSelectedDrop] = useState<number>(-30);
  const [isCustom, setIsCustom] = useState(false);
  const [customInput, setCustomInput] = useState("30");

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
    staleTime: 60000,
  });

  const { data: enrichments = [], isLoading: enrichLoading } = useQuery<Enrichment[]>({
    queryKey: ["/api/enrichments"],
    staleTime: 60000,
  });

  const { data: pricesRaw, isLoading: pricesLoading } = useQuery<Record<string, PriceData>>({
    queryKey: ["/api/prices"],
    staleTime: 60000,
  });

  const isLoading = holdingsLoading || enrichLoading || pricesLoading;

  // ── Derived maps ────────────────────────────────────────────────────────────

  const enrichMap = useMemo(() => {
    const m: Record<string, Enrichment> = {};
    enrichments.forEach((e) => (m[e.ticker] = e));
    return m;
  }, [enrichments]);

  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    if (pricesRaw) {
      Object.entries(pricesRaw).forEach(([ticker, data]) => {
        if (data?.price) m[ticker] = data.price as number;
      });
    }
    return m;
  }, [pricesRaw]);

  // ── Active drop percentage ─────────────────────────────────────────────────

  const activeDrop = useMemo(() => {
    if (isCustom) {
      const v = parseFloat(customInput);
      if (!isNaN(v) && v >= 1 && v <= 90) return -v;
      return -30;
    }
    return selectedDrop;
  }, [isCustom, customInput, selectedDrop]);

  // ── Per-holding impact ─────────────────────────────────────────────────────

  const holdingImpacts = useMemo(() => {
    return holdings
      .map((h) => {
        const beta = enrichMap[h.ticker]?.beta ?? 1.0;
        const cappedBeta = Math.min(beta, 2.5);
        const appliedDrop = activeDrop * cappedBeta; // negative number
        const currentPrice = priceMap[h.ticker] ?? h.avg_cost;
        const currentValue = h.shares * currentPrice;
        const costBasis = h.shares * h.avg_cost;
        const estLoss = currentValue * (appliedDrop / 100);
        const estLossPct = appliedDrop; // same as applied drop
        const stressedValue = currentValue + estLoss;
        return {
          ticker: h.ticker,
          bdd: h.bdd_type,
          beta: cappedBeta,
          appliedDrop,
          estLoss,
          estLossPct,
          stressedValue,
          currentValue,
          costBasis,
        };
      })
      .sort((a, b) => a.estLoss - b.estLoss); // worst first
  }, [holdings, enrichMap, priceMap, activeDrop]);

  // ── Portfolio totals ───────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const totalCurrentValue = holdingImpacts.reduce((s, h) => s + h.currentValue, 0);
    const totalLoss = holdingImpacts.reduce((s, h) => s + h.estLoss, 0);
    const totalCostBasis = holdingImpacts.reduce((s, h) => s + h.costBasis, 0);
    const stressedValue = totalCurrentValue + totalLoss;
    const lossPercent = totalCurrentValue > 0 ? (totalLoss / totalCurrentValue) * 100 : 0;
    return { totalCurrentValue, totalLoss, stressedValue, lossPercent, totalCostBasis };
  }, [holdingImpacts]);

  // ── BDD sleeve summaries ───────────────────────────────────────────────────

  const sleeveSummaries = useMemo(() => {
    const sleeves: Record<string, { totalValue: number; totalLoss: number }> = {
      builder: { totalValue: 0, totalLoss: 0 },
      grounder: { totalValue: 0, totalLoss: 0 },
      engine: { totalValue: 0, totalLoss: 0 },
    };
    holdingImpacts.forEach((h) => {
      const sleeve = h.bdd in sleeves ? h.bdd : "engine";
      sleeves[sleeve].totalValue += h.currentValue;
      sleeves[sleeve].totalLoss += h.estLoss;
    });
    return Object.entries(sleeves).map(([key, data]) => ({
      key,
      label: bddLabel(key),
      totalValue: data.totalValue,
      totalLoss: data.totalLoss,
      lossPct: data.totalValue > 0 ? (data.totalLoss / data.totalValue) * 100 : 0,
    }));
  }, [holdingImpacts]);

  // ── Recovery time ──────────────────────────────────────────────────────────

  const closestRecovery = useMemo(() => {
    const abs = Math.abs(activeDrop);
    // Find closest preset
    let closest = RECOVERY_TIMES[RECOVERY_TIMES.length - 1];
    for (const r of RECOVERY_TIMES) {
      if (abs <= Math.abs(r.drop)) {
        closest = r;
        break;
      }
    }
    return closest;
  }, [activeDrop]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-red-400" />
          Drawdown Stress Tester
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          How much would you lose if markets dropped X%?
        </p>
      </div>

      {/* Scenario selector */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-medium">
          Select Market Drop
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESET_DROPS.map((drop) => (
            <button
              key={drop}
              onClick={() => {
                setSelectedDrop(drop);
                setIsCustom(false);
              }}
              data-testid={`button-drop-${Math.abs(drop)}`}
              className={`px-4 py-2 text-sm font-mono font-semibold rounded-lg border transition-all ${
                !isCustom && selectedDrop === drop
                  ? "bg-red-500/20 border-red-500/50 text-red-300"
                  : "border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              {drop}%
            </button>
          ))}

          {/* Custom input */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
              isCustom
                ? "bg-red-500/20 border-red-500/50"
                : "border-border bg-muted/30"
            }`}
          >
            <span className="text-sm font-mono font-semibold text-muted-foreground">Custom −</span>
            <input
              type="number"
              min="1"
              max="90"
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setIsCustom(true);
              }}
              onFocus={() => setIsCustom(true)}
              className="w-12 bg-transparent text-sm font-mono font-semibold text-red-300 focus:outline-none text-center"
              placeholder="30"
              data-testid="input-custom-drop"
            />
            <span className="text-sm font-mono font-semibold text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      ) : holdings.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <TrendingDown className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No holdings yet</p>
          <p className="text-xs text-muted-foreground">
            Add holdings to your portfolio to run a drawdown simulation.
          </p>
        </div>
      ) : (
        <>
          {/* Portfolio Impact Summary */}
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">
                Market Drop: {activeDrop}%
              </p>
              <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/30">
                Beta-Adjusted
              </Badge>
            </div>

            <div className="mb-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Estimated Portfolio Loss
              </p>
              <p className="text-3xl font-mono font-bold text-red-400" data-testid="text-total-loss">
                {formatAmount(totals.totalLoss)}
              </p>
              <p className="text-sm font-mono text-red-400/80 mt-0.5">
                ({totals.lossPercent.toFixed(1)}%)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-red-500/20">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                  Stressed Value
                </p>
                <p className="font-mono font-semibold text-foreground text-base" data-testid="text-stressed-value">
                  {formatAmount(totals.stressedValue)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                  Cost Basis
                </p>
                <p className="font-mono font-semibold text-muted-foreground text-base">
                  {formatAmount(totals.totalCostBasis)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
              <p className="text-[10px] text-muted-foreground">
                Conservative (beta-adjusted) — Based on each holding's beta × market drop
              </p>
            </div>
          </div>

          {/* Beta source note */}
          <p className="text-[10px] text-muted-foreground px-1">
            Beta from your enrichment data. Holdings with no enrichment use beta = 1.0 (market rate).
          </p>

          {/* Per-holding impact table */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">Per-Holding Impact</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left pb-2 text-muted-foreground font-medium pr-3">Ticker</th>
                    <th className="text-left pb-2 text-muted-foreground font-medium pr-3">BDD</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium pr-3">Beta</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium pr-3">Applied Drop</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium pr-3">Est. Loss ($)</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium pr-3">Est. Loss (%)</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium">Stressed Value</th>
                  </tr>
                </thead>
                <tbody>
                  {holdingImpacts.map((h, i) => (
                    <tr
                      key={h.ticker}
                      className={`${i < holdingImpacts.length - 1 ? "border-b border-border/40" : ""} hover:bg-muted/20 transition-colors`}
                    >
                      <td className="py-2 font-mono font-bold text-foreground pr-3">{h.ticker}</td>
                      <td className="py-2 text-muted-foreground pr-3 whitespace-nowrap">
                        {bddLabel(h.bdd)}
                      </td>
                      <td className="py-2 text-right pr-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-mono text-muted-foreground">{h.beta.toFixed(2)}</span>
                          <BetaBadge beta={h.beta} />
                        </div>
                      </td>
                      <td className={`py-2 text-right font-mono font-semibold pr-3 ${dropColor(h.appliedDrop)}`}>
                        {h.appliedDrop.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right font-mono text-red-400 font-semibold pr-3">
                        {formatAmount(h.estLoss)}
                      </td>
                      <td className={`py-2 text-right font-mono pr-3 ${dropColor(h.appliedDrop)}`}>
                        {h.appliedDrop.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right font-mono text-foreground">
                        {formatAmount(h.stressedValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* BDD Sleeve summary cards */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">
              BDD Sleeve Impact
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sleeveSummaries.map((sleeve) => (
                <div
                  key={sleeve.key}
                  className="rounded-lg border border-border bg-card p-4"
                  data-testid={`card-sleeve-${sleeve.key}`}
                >
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                    {sleeve.label}
                  </p>
                  {sleeve.totalValue > 0 ? (
                    <>
                      <p className="font-mono font-bold text-red-400 text-lg">
                        {sleeve.lossPct.toFixed(1)}%
                      </p>
                      <p className="font-mono text-xs text-red-400/80 mt-0.5">
                        {formatAmount(sleeve.totalLoss)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        of {formatAmount(sleeve.totalValue)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No holdings</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recovery time estimate */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Historical Recovery Times (S&P 500)</h3>
            </div>
            <div className="space-y-2">
              {RECOVERY_TIMES.map((r) => {
                const isActive = Math.abs(activeDrop) <= Math.abs(r.drop) &&
                  (RECOVERY_TIMES.indexOf(r) === 0 ||
                    Math.abs(activeDrop) > Math.abs(RECOVERY_TIMES[RECOVERY_TIMES.indexOf(r) - 1]?.drop ?? 0));
                const actuallyActive = closestRecovery.drop === r.drop;
                return (
                  <div
                    key={r.drop}
                    className={`flex items-center gap-3 py-1.5 px-2 rounded-md transition-colors ${
                      actuallyActive ? "bg-red-500/10 border border-red-500/20" : ""
                    }`}
                  >
                    <span className={`font-mono text-xs font-semibold w-8 shrink-0 ${actuallyActive ? "text-red-400" : "text-muted-foreground"}`}>
                      {r.drop}%
                    </span>
                    <span className="text-xs text-muted-foreground flex-1">{r.note}</span>
                    {actuallyActive && (
                      <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20 shrink-0">
                        ≈ your drop
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Education note */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 flex gap-3">
            <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Beta measures how much a stock tends to move relative to the market. A beta of 1.5 means when
              the S&P 500 falls 30%, that stock historically falls ~45%. ETFs like VOO have beta ≈ 1.0 by
              design. High-growth stocks often have beta &gt; 1.5. Beta is capped at 2.5× in this simulation.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

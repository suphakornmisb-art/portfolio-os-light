import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Holding } from "@shared/schema";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCurrency, pnlColor } from "@/components/format";
import { ArrowLeftRight, Info, AlertTriangle, TrendingDown, TrendingUp, DollarSign } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PriceMap = Record<string, { price?: number }>;

interface ExchangeRateData {
  rate: number;
  pair: string;
  cached_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_PURCHASE_RATE = 33.0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTHB(value: number, compact = false): string {
  return fmtCurrency(value, "THB", compact);
}

function fmtSign(value: number): string {
  return value >= 0 ? "+" : "";
}

// ── Stacked Bar ───────────────────────────────────────────────────────────────

function StackedBar({
  equityPnl,
  fxPnl,
}: {
  equityPnl: number;
  fxPnl: number;
}) {
  const total = Math.abs(equityPnl) + Math.abs(fxPnl);
  if (total === 0) {
    return <div className="h-2 rounded-full bg-muted w-full" />;
  }
  const equityPct = (Math.abs(equityPnl) / total) * 100;
  const fxPct = (Math.abs(fxPnl) / total) * 100;

  const equityColor =
    equityPnl >= 0
      ? "bg-emerald-500/70"
      : "bg-red-500/70";
  const fxColor =
    fxPnl >= 0
      ? "bg-emerald-300/50"
      : "bg-amber-400/70";

  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px w-full min-w-[80px]">
      {equityPct > 0 && (
        <div
          className={`h-full rounded-l-full ${equityColor}`}
          style={{ width: `${equityPct}%` }}
          title={`Equity P&L: ${fmtTHB(equityPnl, true)}`}
        />
      )}
      {fxPct > 0 && (
        <div
          className={`h-full rounded-r-full ${fxColor}`}
          style={{ width: `${fxPct}%` }}
          title={`FX P&L: ${fmtTHB(fxPnl, true)}`}
        />
      )}
    </div>
  );
}

// ── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  tooltip,
  iconClass,
  valueClass,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tooltip?: string;
  iconClass: string;
  valueClass: string;
}) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card p-3 relative">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        {tooltip && (
          <button
            className="ml-auto"
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            onClick={() => setShowTip((s) => !s)}
            aria-label="More info"
          >
            <Info className="h-3 w-3 text-muted-foreground/60 hover:text-muted-foreground" />
          </button>
        )}
      </div>
      <div className={`font-mono text-base font-semibold ${valueClass}`}>
        {fmtSign(value)}{fmtTHB(value, true)}
      </div>
      {tooltip && showTip && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 rounded-lg border border-border bg-popover p-2.5 shadow-lg text-[11px] text-muted-foreground leading-relaxed">
          {tooltip}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FxTrackerPage() {
  const { currency } = useCurrency();
  const [purchaseRate, setPurchaseRate] = useState(DEFAULT_PURCHASE_RATE);

  // Data fetching
  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  const { data: prices = {} as PriceMap, isLoading: pricesLoading } = useQuery<PriceMap>({
    queryKey: ["/api/prices"],
    staleTime: 60000,
  });

  // Always fetch exchange rate directly — don't depend on currency toggle
  const { data: rateData, isLoading: rateLoading } = useQuery<ExchangeRateData>({
    queryKey: ["/api/exchange-rate"],
    staleTime: 60 * 60 * 1000,
  });

  const currentRate = rateData?.rate ?? 33.5;
  const rateChangePct = ((currentRate - purchaseRate) / purchaseRate) * 100;
  const usdStrengthened = currentRate > purchaseRate;

  // Core math — all useMemo
  const enriched = useMemo(() => {
    return holdings.map((h) => {
      const currentPrice = prices[h.ticker]?.price ?? 0;

      // USD P&L
      const equityPnlUsd = (currentPrice - h.avg_cost) * h.shares;

      // THB values
      const equityPnlThb = equityPnlUsd * currentRate;
      const fxPnlThb = h.avg_cost * h.shares * (currentRate - purchaseRate);
      const totalPnlThb = equityPnlThb + fxPnlThb;
      const fxAsPct =
        totalPnlThb !== 0 ? (fxPnlThb / Math.abs(totalPnlThb)) * 100 : 0;

      const costBasisUsd = h.avg_cost * h.shares;
      const currentValueThb = currentPrice * h.shares * currentRate;

      return {
        ...h,
        currentPrice,
        equityPnlUsd,
        equityPnlThb,
        fxPnlThb,
        totalPnlThb,
        fxAsPct,
        costBasisUsd,
        currentValueThb,
      };
    });
  }, [holdings, prices, currentRate, purchaseRate]);

  const totalEquityPnlThb = useMemo(
    () => enriched.reduce((s, h) => s + h.equityPnlThb, 0),
    [enriched],
  );
  const totalFxPnlThb = useMemo(
    () => enriched.reduce((s, h) => s + h.fxPnlThb, 0),
    [enriched],
  );
  const totalCombinedPnlThb = totalEquityPnlThb + totalFxPnlThb;

  const totalCostBasisThb = useMemo(
    () => enriched.reduce((s, h) => s + h.costBasisUsd * purchaseRate, 0),
    [enriched, purchaseRate],
  );
  const fxImpactPct =
    totalCostBasisThb > 0
      ? (totalFxPnlThb / totalCostBasisThb) * 100
      : 0;

  const isLoading = holdingsLoading || pricesLoading || rateLoading;

  // ── USD banner ─────────────────────────────────────────────────────────────
  if (currency === "USD") {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-yellow-400" />
            THB FX Impact Tracker
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Isolate FX P&L from equity P&L — see how USD/THB rate changes affect your returns
          </p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">Switch to THB to see FX impact</p>
            <p className="text-xs text-muted-foreground mt-1">
              Currently showing USD view which has no FX component. Use the ฿ toggle in the top
              navigation to switch to THB mode and unlock the full FX attribution analysis.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-yellow-400" />
          THB FX Impact Tracker
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Isolate how USD/THB rate changes affect your portfolio
        </p>
      </div>

      {/* ── Exchange Rate Assumption ────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-medium text-foreground">Exchange Rate Assumption</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">
              Your assumed avg purchase rate
            </label>
            <span className="font-mono text-sm font-semibold text-foreground">
              {purchaseRate.toFixed(1)} THB/USD
            </span>
          </div>
          <input
            type="range"
            min={28}
            max={40}
            step={0.1}
            value={purchaseRate}
            onChange={(e) => setPurchaseRate(parseFloat(e.target.value))}
            className="w-full h-1.5 appearance-none cursor-pointer rounded-full bg-muted accent-primary"
            data-testid="slider-purchase-rate"
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span>28.0</span>
            <span>40.0</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Current Rate</div>
            <div className="font-mono text-sm font-semibold text-foreground">
              {currentRate.toFixed(2)} THB/USD
            </div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Rate Change Since Purchase</div>
            <div className={`font-mono text-sm font-semibold ${pnlColor(rateChangePct)}`}>
              {fmtSign(rateChangePct)}{rateChangePct.toFixed(2)}%
              <span className="text-[10px] font-normal text-muted-foreground ml-1.5">
                {usdStrengthened ? "(USD strengthened)" : "(USD weakened)"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Total Equity P&L"
          value={totalEquityPnlThb}
          icon={TrendingUp}
          iconClass="text-primary"
          valueClass={pnlColor(totalEquityPnlThb)}
        />
        <SummaryCard
          label="Total FX P&L"
          value={totalFxPnlThb}
          icon={ArrowLeftRight}
          iconClass="text-yellow-400"
          valueClass={pnlColor(totalFxPnlThb)}
          tooltip={
            totalFxPnlThb < 0
              ? "USD weakened vs THB → your USD assets are worth less in THB terms, even if the stock price didn't change."
              : "USD strengthened vs THB → your USD assets gained additional value in THB terms beyond stock price movement."
          }
        />
        <SummaryCard
          label="Total Combined P&L"
          value={totalCombinedPnlThb}
          icon={totalCombinedPnlThb >= 0 ? TrendingUp : TrendingDown}
          iconClass={pnlColor(totalCombinedPnlThb)}
          valueClass={pnlColor(totalCombinedPnlThb)}
        />
      </div>

      {/* ── Key Insight Card ───────────────────────────────────────────────── */}
      <div className={`rounded-lg border p-3 flex items-start gap-3 ${
        totalFxPnlThb < 0
          ? "border-amber-500/30 bg-amber-500/8"
          : "border-emerald-500/30 bg-emerald-500/8"
      }`}>
        <Info className={`h-4 w-4 mt-0.5 shrink-0 ${totalFxPnlThb < 0 ? "text-amber-400" : "text-emerald-400"}`} />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Net FX impact on your portfolio: </span>
          <span className={`font-mono font-semibold ${pnlColor(totalFxPnlThb)}`}>
            {fmtSign(totalFxPnlThb)}{fmtTHB(totalFxPnlThb, true)} ({fmtSign(fxImpactPct)}{fxImpactPct.toFixed(2)}%)
          </span>
          {" — "}USD has{" "}
          <span className="font-medium text-foreground">
            {usdStrengthened ? "strengthened" : "weakened"}
          </span>{" "}
          <span className={`font-mono ${pnlColor(rateChangePct)}`}>{Math.abs(rateChangePct).toFixed(2)}%</span>{" "}
          vs your assumed purchase rate of{" "}
          <span className="font-mono">{purchaseRate.toFixed(1)} THB/USD</span>.
        </p>
      </div>

      {/* ── Per-Holding Table ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">Per-Holding FX Breakdown</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Equity P&L (price change) vs FX P&L (rate change) — all in THB
          </p>
        </div>

        {enriched.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No holdings found. Add holdings on the Portfolio tab.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Ticker</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Shares</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Avg Cost</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Current</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Equity P&L ฿</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">FX P&L ฿</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Combined ฿</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">FX %</th>
                  <th className="px-3 py-2.5 text-muted-foreground uppercase tracking-wider text-[10px]">Split</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((h) => (
                  <tr
                    key={h.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                    data-testid={`row-fx-${h.ticker}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-semibold text-foreground text-xs">{h.ticker}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      {h.shares.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      ${h.avg_cost.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      ${h.currentPrice.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${pnlColor(h.equityPnlThb)}`}>
                      {fmtSign(h.equityPnlThb)}{fmtTHB(h.equityPnlThb, true)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${
                      h.fxPnlThb < 0 ? "text-amber-400" : pnlColor(h.fxPnlThb)
                    }`}>
                      {fmtSign(h.fxPnlThb)}{fmtTHB(h.fxPnlThb, true)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${pnlColor(h.totalPnlThb)}`}>
                      {fmtSign(h.totalPnlThb)}{fmtTHB(h.totalPnlThb, true)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono text-[11px] ${
                      h.fxAsPct < -5 || h.fxAsPct > 50 ? "text-amber-400" : "text-muted-foreground"
                    }`}>
                      {h.fxAsPct >= 0 ? "+" : ""}{h.fxAsPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 min-w-[100px]">
                      <StackedBar equityPnl={h.equityPnlThb} fxPnl={h.fxPnlThb} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-foreground text-xs" colSpan={4}>Total</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-semibold text-xs ${pnlColor(totalEquityPnlThb)}`}>
                    {fmtSign(totalEquityPnlThb)}{fmtTHB(totalEquityPnlThb, true)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono font-semibold text-xs ${
                    totalFxPnlThb < 0 ? "text-amber-400" : pnlColor(totalFxPnlThb)
                  }`}>
                    {fmtSign(totalFxPnlThb)}{fmtTHB(totalFxPnlThb, true)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono font-bold text-xs ${pnlColor(totalCombinedPnlThb)}`}>
                    {fmtSign(totalCombinedPnlThb)}{fmtTHB(totalCombinedPnlThb, true)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Education Callout ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-amber-300">FX Risk Education</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When USD weakens against THB, your US stocks lose value in THB terms — even if stock
              prices rose in USD. A 5% USD depreciation costs you 5% on the entire cost basis
              regardless of what the stocks did. This is why many institutional investors hedge
              FX exposure.
            </p>
          </div>
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-emerald-500/70" />
          <span>Equity P&L (positive)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-red-500/70" />
          <span>Equity P&L (negative)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-amber-400/70" />
          <span>FX P&L (negative / USD weakened)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-emerald-300/50" />
          <span>FX P&L (positive / USD strengthened)</span>
        </div>
      </div>
    </div>
  );
}

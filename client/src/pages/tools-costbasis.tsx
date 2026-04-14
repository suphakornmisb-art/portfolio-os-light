import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingDown, CheckCircle, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import type { Holding } from "@shared/schema";
import { pnlColor } from "@/components/format";
import { useCurrency } from "@/contexts/CurrencyContext";

interface CostBasisResult {
  ticker: string;
  current_shares: number;
  current_avg_cost: number;
  current_price: number;
  target_avg_cost: number;
  shares_needed: number;
  dollar_cost: number;
  new_avg_cost: number;
  new_total_shares: number;
  new_total_cost_basis: number;
}

export default function CostBasisPage() {
  const { formatAmount } = useCurrency();
  const [ticker, setTicker] = useState("");
  const [targetAvg, setTargetAvg] = useState("");

  const { data: holdings = [] } = useQuery<Holding[]>({ queryKey: ["/api/holdings"] });

  const selectedHolding = holdings.find((h) => h.ticker === ticker);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!ticker || !targetAvg) throw new Error("Select ticker and enter target avg cost");
      const res = await apiRequest("POST", "/api/cost-basis-calc", {
        ticker,
        target_avg_cost: parseFloat(targetAvg),
      });
      return res.json() as Promise<CostBasisResult>;
    },
  });

  const handleTickerChange = (t: string) => {
    setTicker(t);
    setTargetAvg("");
    mutation.reset();
  };

  const result = mutation.data;
  const errorMsg = mutation.error ? (mutation.error as any).message : null;

  // Validation hints
  const targetVal = parseFloat(targetAvg);
  let validationHint = "";
  if (selectedHolding && targetVal > 0) {
    if (targetVal >= selectedHolding.avg_cost) {
      validationHint = `Target must be below current avg cost ($${selectedHolding.avg_cost.toFixed(2)})`;
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/tools">
          <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" data-testid="button-back-tools">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-amber-400" />
            Cost Basis Optimizer
          </h1>
          <p className="text-xs text-muted-foreground">Calculate shares to buy to reach a target average cost</p>
        </div>
      </div>

      {/* Inputs */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Holding
            </label>
            <Select value={ticker} onValueChange={handleTickerChange}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-costbasis-ticker">
                <SelectValue placeholder="Select holding" />
              </SelectTrigger>
              <SelectContent>
                {holdings.map((h) => (
                  <SelectItem key={h.ticker} value={h.ticker}>
                    {h.ticker} — avg ${h.avg_cost.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedHolding && (
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                Current: {selectedHolding.shares.toFixed(4)} shares @ ${selectedHolding.avg_cost.toFixed(2)} avg
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Target Avg Cost (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
              <Input
                type="number"
                step="0.01"
                value={targetAvg}
                onChange={(e) => { setTargetAvg(e.target.value); mutation.reset(); }}
                placeholder="e.g. 280.00"
                className="pl-6 h-8 text-xs font-mono"
                disabled={!ticker}
                data-testid="input-target-avg"
              />
            </div>
            {validationHint && (
              <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {validationHint}
              </p>
            )}
          </div>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={!ticker || !targetAvg || !!validationHint || mutation.isPending}
          className="w-full"
          data-testid="button-calculate-costbasis"
        >
          {mutation.isPending ? "Calculating…" : "Calculate"}
        </Button>
      </div>

      {/* Result */}
      {mutation.isPending && <Skeleton className="h-48 rounded-lg" />}

      {errorMsg && !mutation.isPending && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {result && !mutation.isPending && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-foreground">{result.ticker} — Cost Basis Plan</h2>
          </div>

          {/* Current vs Target */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Avg Cost</div>
              <div className="font-mono text-lg font-semibold">{formatAmount(result.current_avg_cost)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{result.current_shares.toFixed(4)} shares</div>
            </div>
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Target Avg Cost</div>
              <div className="font-mono text-lg font-semibold text-emerald-400">{formatAmount(result.target_avg_cost)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                saving {((1 - result.target_avg_cost / result.current_avg_cost) * 100).toFixed(1)}% vs current
              </div>
            </div>
          </div>

          {/* What to buy */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Buy Order</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[10px] text-muted-foreground">Shares to Buy</div>
                <div className="font-mono text-xl font-bold text-primary">{result.shares_needed.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Total Cost</div>
                <div className="font-mono text-xl font-bold text-primary">{formatAmount(result.dollar_cost)}</div>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2 font-mono">
              At current price {formatAmount(result.current_price)} per share
            </div>
          </div>

          {/* After state */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">After Buying</h3>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-[10px] text-muted-foreground">New Total Shares</div>
                <div className="font-mono font-semibold">{result.new_total_shares.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">New Avg Cost</div>
                <div className="font-mono font-semibold text-emerald-400">{formatAmount(result.new_avg_cost)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">New Cost Basis</div>
                <div className="font-mono font-semibold">{formatAmount(result.new_total_cost_basis)}</div>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Verified: new avg cost {formatAmount(result.new_avg_cost)} ≈ target {formatAmount(result.target_avg_cost)}
            {" "}({Math.abs(result.new_avg_cost - result.target_avg_cost) < 0.02 ? "✓ exact" : "≈ close"})
          </p>
        </div>
      )}
    </div>
  );
}

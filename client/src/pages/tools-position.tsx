import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Target } from "lucide-react";
import { Link } from "wouter";
import type { Holding } from "@shared/schema";
import { BDD_COLORS, bddLabel, fmtPct } from "@/components/format";
import { useCurrency } from "@/contexts/CurrencyContext";

interface SizingResult {
  ticker: string;
  bdd_type: string;
  conviction: number;
  suggested_pct: number;
  suggested_dollar: number;
  shares_to_buy: number;
  current_price: number;
  portfolio_value: number;
  resulting_weight_pct: number;
  existing: {
    current_shares: number;
    current_avg_cost: number;
    current_value: number;
    current_weight_pct: number;
    new_avg_cost: number;
    new_total_shares: number;
    new_weight_pct: number;
  } | null;
}

const CONVICTION_LABELS: Record<number, string> = {
  1: "Very Low",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Very High",
};

export default function PositionSizingPage() {
  const { formatAmount } = useCurrency();
  const [ticker, setTicker] = useState("");
  const [customTicker, setCustomTicker] = useState("");
  const [conviction, setConviction] = useState(3);
  const [bddType, setBddType] = useState("engine");

  const { data: holdings = [] } = useQuery<Holding[]>({ queryKey: ["/api/holdings"] });

  const mutation = useMutation({
    mutationFn: async () => {
      const t = ticker === "__custom__" ? customTicker : ticker;
      if (!t) throw new Error("Select a ticker");
      const res = await apiRequest("POST", "/api/position-size", {
        ticker: t,
        conviction,
        bdd_type: bddType,
      });
      return res.json() as Promise<SizingResult>;
    },
  });

  const result = mutation.data;
  const colors = result ? BDD_COLORS[result.bdd_type] || BDD_COLORS.engine : BDD_COLORS.engine;

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
            <Target className="w-5 h-5 text-blue-400" />
            Position Sizing
          </h1>
          <p className="text-xs text-muted-foreground">Size positions by conviction × BDD type × portfolio value</p>
        </div>
      </div>

      {/* Inputs */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Ticker</label>
            <Select value={ticker} onValueChange={(v) => { setTicker(v); if (v !== "__custom__") { const h = holdings.find(h => h.ticker === v); if (h) setBddType(h.bdd_type); } }}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-position-ticker">
                <SelectValue placeholder="Select or enter ticker" />
              </SelectTrigger>
              <SelectContent>
                {holdings.map((h) => (
                  <SelectItem key={h.ticker} value={h.ticker}>{h.ticker}</SelectItem>
                ))}
                <SelectItem value="__custom__">Other (type below)</SelectItem>
              </SelectContent>
            </Select>
            {ticker === "__custom__" && (
              <Input
                value={customTicker}
                onChange={(e) => setCustomTicker(e.target.value.toUpperCase())}
                placeholder="e.g. NVDA"
                className="mt-2 h-8 text-xs font-mono"
                data-testid="input-custom-ticker"
              />
            )}
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">BDD Type</label>
            <Select value={bddType} onValueChange={setBddType}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-bdd-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="engine">Engine (3–5%)</SelectItem>
                <SelectItem value="grounder">Grounder (2–4%)</SelectItem>
                <SelectItem value="builder">Builder (1.5–3%)</SelectItem>
                <SelectItem value="moonshot">Moonshot (0.5–1.5%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Conviction Level
            </label>
            <span className={`text-xs font-semibold ${conviction >= 4 ? "text-emerald-400" : conviction <= 2 ? "text-amber-400" : "text-foreground"}`}>
              {conviction} — {CONVICTION_LABELS[conviction]}
            </span>
          </div>
          <Slider
            min={1}
            max={5}
            step={1}
            value={[conviction]}
            onValueChange={([v]) => setConviction(v)}
            className="w-full"
            data-testid="slider-conviction"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>Very Low (0.5×)</span>
            <span>Moderate (1×)</span>
            <span>Very High (1.5×)</span>
          </div>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || (!ticker || (ticker === "__custom__" && !customTicker))}
          className="w-full"
          data-testid="button-calculate-sizing"
        >
          {mutation.isPending ? "Calculating…" : "Calculate Position Size"}
        </Button>
      </div>

      {/* Result */}
      {mutation.isPending && <Skeleton className="h-48 rounded-lg" />}

      {mutation.data && !mutation.isPending && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {result!.ticker}
            </h2>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
              {bddLabel(result!.bdd_type)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Suggested %</div>
              <div className="font-mono text-lg font-semibold text-primary">{result!.suggested_pct.toFixed(2)}%</div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Suggested $</div>
              <div className="font-mono text-lg font-semibold text-primary">{formatAmount(result!.suggested_dollar)}</div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Shares to Buy</div>
              <div className="font-mono text-lg font-semibold">{result!.shares_to_buy.toFixed(3)}</div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Price</div>
              <div className="font-mono text-lg font-semibold">{formatAmount(result!.current_price)}</div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Portfolio value: <span className="font-mono text-foreground">{formatAmount(result!.portfolio_value, true)}</span>
            {" · "}
            Resulting weight: <span className="font-mono text-primary">{result!.resulting_weight_pct.toFixed(2)}%</span>
          </div>

          {result!.existing && (
            <div className="border-t border-border pt-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Existing Position — After Adding
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-[10px] text-muted-foreground">Current Shares</div>
                  <div className="font-mono">{result!.existing.current_shares.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Current Avg Cost</div>
                  <div className="font-mono">{formatAmount(result!.existing.current_avg_cost)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Current Weight</div>
                  <div className="font-mono">{result!.existing.current_weight_pct.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">New Total Shares</div>
                  <div className="font-mono text-primary">{result!.existing.new_total_shares.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">New Avg Cost</div>
                  <div className="font-mono text-primary">{formatAmount(result!.existing.new_avg_cost)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">New Weight</div>
                  <div className="font-mono text-primary">{result!.existing.new_weight_pct.toFixed(2)}%</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {mutation.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          {(mutation.error as any).message}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, DollarSign, HelpCircle } from "lucide-react";
import { Link } from "wouter";
import { BDD_COLORS, bddLabel, fmtPct } from "@/components/format";
import { useCurrency } from "@/contexts/CurrencyContext";

interface AllocationRow {
  ticker: string;
  bdd_type: string;
  suggested_dollar: number;
  shares_to_buy: number;
  current_price: number;
  fair_value: number;
  pfv_ratio: number;
  reason: string;
}

interface DeployResult {
  allocations: AllocationRow[];
  total_cash: number;
  holdings_count: number;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CapitalDeployPage() {
  const { formatAmount, currency, convert } = useCurrency();
  const [cashInput, setCashInput] = useState("");
  const debouncedCash = useDebounce(cashInput, 300);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (cash: number) => {
      const res = await apiRequest("POST", "/api/capital-deploy", { cash });
      return res.json() as Promise<DeployResult>;
    },
  });

  useEffect(() => {
    const cash = parseFloat(debouncedCash);
    if (cash > 0) {
      mutation.mutate(cash);
    }
  }, [debouncedCash]);

  const cashUSD = parseFloat(cashInput) || 0;

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
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Capital Deployment
          </h1>
          <p className="text-xs text-muted-foreground">Smart allocation using BDD gap scores × fair value discount</p>
        </div>
      </div>

      {/* Cash input */}
      <div className="rounded-lg border border-border bg-card p-4">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
          Available Cash (USD)
        </label>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
            <Input
              type="number"
              min="0"
              step="100"
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
              placeholder="10000"
              className="pl-6 font-mono text-sm"
              data-testid="input-cash-amount"
            />
          </div>
          {cashUSD > 0 && currency === "THB" && (
            <span className="text-xs text-muted-foreground font-mono">
              ≈ {formatAmount(cashUSD, true)}
            </span>
          )}
          {mutation.isPending && (
            <span className="text-xs text-primary animate-pulse">Calculating…</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Enter in USD — allocation updates automatically as you type
        </p>
      </div>

      {/* Results */}
      {mutation.isPending && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      )}

      {mutation.data && !mutation.isPending && (
        <>
          {mutation.data.allocations.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">No undervalued + underweight positions found.</p>
              <p className="text-xs text-muted-foreground mt-1">Enrich holdings and add fair value data to get allocations.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Allocation Plan — {formatAmount(cashUSD, true)} total
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {mutation.data.allocations.length} positions
                </span>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left font-medium p-2.5 pl-3.5">Ticker</th>
                      <th className="text-right font-medium p-2.5">Suggested</th>
                      <th className="text-right font-medium p-2.5">Shares</th>
                      <th className="text-right font-medium p-2.5">Price</th>
                      <th className="text-right font-medium p-2.5">Fair Value</th>
                      <th className="text-right font-medium p-2.5">P/FV</th>
                      <th className="text-center font-medium p-2.5">BDD</th>
                      <th className="text-center font-medium p-2.5 pr-3.5">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mutation.data.allocations.map((row, i) => {
                      const colors = BDD_COLORS[row.bdd_type] || BDD_COLORS.engine;
                      const pct = cashUSD > 0 ? (row.suggested_dollar / cashUSD) * 100 : 0;
                      return (
                        <>
                          <tr
                            key={row.ticker}
                            className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                            data-testid={`row-capital-${row.ticker}`}
                            onClick={() => setExpandedRow(expandedRow === row.ticker ? null : row.ticker)}
                          >
                            <td className="p-2.5 pl-3.5">
                              <span className="font-mono font-semibold">{row.ticker}</span>
                              <div className="mt-1 h-1 w-24 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.min(pct * 3, 100)}%` }} />
                              </div>
                            </td>
                            <td className="p-2.5 text-right font-mono font-semibold text-primary">
                              {formatAmount(row.suggested_dollar)}
                            </td>
                            <td className="p-2.5 text-right font-mono">{row.shares_to_buy.toFixed(3)}</td>
                            <td className="p-2.5 text-right font-mono">{formatAmount(row.current_price)}</td>
                            <td className="p-2.5 text-right font-mono text-emerald-400">{formatAmount(row.fair_value)}</td>
                            <td className="p-2.5 text-right font-mono text-emerald-400">{row.pfv_ratio.toFixed(2)}x</td>
                            <td className="p-2.5 text-center">
                              <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                {bddLabel(row.bdd_type)}
                              </span>
                            </td>
                            <td className="p-2.5 pr-3.5 text-center">
                              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground mx-auto" />
                            </td>
                          </tr>
                          {expandedRow === row.ticker && (
                            <tr key={`${row.ticker}-reason`} className="bg-muted/10">
                              <td colSpan={8} className="px-3.5 py-2 text-xs text-muted-foreground">
                                <span className="text-foreground/60">Reason: </span>{row.reason}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border/50">
                {mutation.data.allocations.map((row) => {
                  const colors = BDD_COLORS[row.bdd_type] || BDD_COLORS.engine;
                  const pct = cashUSD > 0 ? (row.suggested_dollar / cashUSD) * 100 : 0;
                  return (
                    <div key={row.ticker} className="p-3 space-y-2" data-testid={`card-capital-${row.ticker}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{row.ticker}</span>
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                            {bddLabel(row.bdd_type)}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-primary">{formatAmount(row.suggested_dollar)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><div className="text-[10px] text-muted-foreground">Shares</div><div className="font-mono">{row.shares_to_buy.toFixed(3)}</div></div>
                        <div><div className="text-[10px] text-muted-foreground">Price</div><div className="font-mono">{formatAmount(row.current_price)}</div></div>
                        <div><div className="text-[10px] text-muted-foreground">P/FV</div><div className="font-mono text-emerald-400">{row.pfv_ratio.toFixed(2)}x</div></div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{row.reason}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {mutation.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          {(mutation.error as any).message}
        </div>
      )}
    </div>
  );
}

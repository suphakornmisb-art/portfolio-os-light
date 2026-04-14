import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Plus, Trash2, TrendingUp, BookOpen } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Holding, DividendLog, Enrichment } from "@shared/schema";

export default function DividendsPage() {
  const { toast } = useToast();
  const { formatAmount, currency, rate } = useCurrency();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    ticker: "",
    amount_usd: "",
    received_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const { data: holdings = [] } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  const { data: dividendLogs = [], isLoading: logsLoading } = useQuery<DividendLog[]>({
    queryKey: ["/api/dividends"],
  });

  const { data: enrichments = [] } = useQuery<Enrichment[]>({
    queryKey: ["/api/enrichments"],
  });

  // Map enrichments by ticker
  const enrichMap = useMemo(() => {
    const m: Record<string, Enrichment> = {};
    for (const e of enrichments) m[e.ticker] = e;
    return m;
  }, [enrichments]);

  // Compute dividend income per holding
  const holdingDividends = useMemo(() => {
    return holdings
      .map((h) => {
        const enrich = enrichMap[h.ticker];
        const divYield = enrich?.dividend_yield ?? 0; // % e.g. 3.8
        // We need price. Enrichment doesn't store price directly.
        // Use avg_cost as a proxy for annual dividend per share calculation:
        // Annual div per share ≈ avg_cost × (divYield / 100)
        const annualDivPerShare = h.avg_cost * (divYield / 100);
        const estAnnualIncome = annualDivPerShare * h.shares;
        // Yield on cost = (annual_div_per_share / avg_cost) × 100 = divYield (same metric when using avg_cost as price proxy)
        // True yield on cost should use actual purchase price (avg_cost) vs current yield:
        // If we had current price we'd do: yoc = (current_price * divYield/100) / avg_cost * 100
        // For now, approximate: yoc = divYield (if no price enrichment separate from avg_cost)
        const yieldOnCost = divYield; // approximate
        return {
          ticker: h.ticker,
          shares: h.shares,
          avg_cost: h.avg_cost,
          divYield,
          annualDivPerShare,
          estAnnualIncome,
          yieldOnCost,
        };
      })
      .filter((h) => h.divYield > 0)
      .sort((a, b) => b.estAnnualIncome - a.estAnnualIncome);
  }, [holdings, enrichMap]);

  // Summary stats
  const totalProjectedAnnual = useMemo(
    () => holdingDividends.reduce((s, h) => s + h.estAnnualIncome, 0),
    [holdingDividends]
  );

  const totalCost = useMemo(
    () => holdings.reduce((s, h) => s + h.shares * h.avg_cost, 0),
    [holdings]
  );

  const portfolioYieldOnCost = useMemo(
    () => (totalCost > 0 ? (totalProjectedAnnual / totalCost) * 100 : 0),
    [totalProjectedAnnual, totalCost]
  );

  const largestSource = holdingDividends[0];

  // Create dividend log
  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/dividends", {
        ticker: data.ticker,
        amount_usd: parseFloat(data.amount_usd),
        received_date: data.received_date,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividends"] });
      setForm({
        ticker: "",
        amount_usd: "",
        received_date: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      setShowForm(false);
      toast({ title: "Dividend logged" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to log dividend", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/dividends/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividends"] });
      toast({ title: "Dividend log deleted" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.amount_usd) return;
    createMutation.mutate(form);
  };

  const maxIncome = holdingDividends[0]?.estAnnualIncome || 1;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Dividend &amp; Income Ledger
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track dividend income and yield-on-cost
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="gap-1.5"
          data-testid="button-log-dividend"
        >
          <Plus className="h-3.5 w-3.5" />
          Log Dividend
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Projected Annual Income
            </span>
          </div>
          <span className="font-mono text-lg font-semibold text-emerald-400" data-testid="text-projected-annual">
            {formatAmount(totalProjectedAnnual)}
          </span>
          <p className="text-[10px] text-muted-foreground mt-0.5">Based on current holdings &amp; yields</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Yield on Cost
            </span>
          </div>
          <span className="font-mono text-lg font-semibold text-primary" data-testid="text-yoc">
            {portfolioYieldOnCost.toFixed(2)}%
          </span>
          <p className="text-[10px] text-muted-foreground mt-0.5">Across dividend-paying holdings</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Largest Source
            </span>
          </div>
          {largestSource ? (
            <>
              <span className="font-mono text-lg font-semibold text-amber-400" data-testid="text-largest-source">
                {largestSource.ticker}
              </span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatAmount(largestSource.estAnnualIncome)}/yr
              </p>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      </div>

      {/* Education callout */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-400 mb-1">Understanding Yield-on-Cost</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Yield-on-cost shows your personal dividend yield based on what you paid, not today's
              price. A stock you bought at $30 that now pays $1.20/year has a 4% yield-on-cost even
              if the current yield is only 2.5%. It rewards patient, long-term holding.
            </p>
          </div>
        </div>
      </div>

      {/* Log form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Log Dividend Payment
          </h2>
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Ticker
              </label>
              <Select
                value={form.ticker}
                onValueChange={(v) => setForm((f) => ({ ...f, ticker: v }))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-div-ticker">
                  <SelectValue placeholder="Select ticker" />
                </SelectTrigger>
                <SelectContent>
                  {holdings.map((h) => (
                    <SelectItem key={h.ticker} value={h.ticker}>
                      {h.ticker}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Amount (USD)
              </label>
              <Input
                type="number"
                step="0.01"
                value={form.amount_usd}
                onChange={(e) => setForm((f) => ({ ...f, amount_usd: e.target.value }))}
                placeholder="e.g. 28.45"
                className="h-8 text-xs font-mono"
                data-testid="input-div-amount"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Received Date
              </label>
              <Input
                type="date"
                value={form.received_date}
                onChange={(e) => setForm((f) => ({ ...f, received_date: e.target.value }))}
                className="h-8 text-xs font-mono"
                data-testid="input-div-date"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Notes
              </label>
              <div className="flex gap-2">
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Q4 2025 dividend"
                  className="h-8 text-xs flex-1"
                  data-testid="input-div-notes"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!form.ticker || !form.amount_usd || createMutation.isPending}
                  className="h-8 px-3 shrink-0"
                  data-testid="button-create-div"
                >
                  Log
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Holdings by dividend yield */}
      {holdingDividends.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-3 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Holdings by Dividend Yield
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    Ticker
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    Yield %
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    Annual $/sh
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    Shares
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    Est. Annual
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    YoC %
                  </th>
                  <th className="px-3 py-2 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {holdingDividends.map((h) => (
                  <tr
                    key={h.ticker}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    data-testid={`row-div-${h.ticker}`}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-bold text-foreground">{h.ticker}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-400">
                      {h.divYield.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-foreground">
                      ${h.annualDivPerShare.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      {h.shares.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                      {formatAmount(h.estAnnualIncome)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-primary">
                      {h.yieldOnCost.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5">
                      {/* Income bar */}
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${(h.estAnnualIncome / maxIncome) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Projected income chart — CSS horizontal bars */}
      {holdingDividends.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Projected Annual Income by Holding
          </h2>
          <div className="space-y-2">
            {holdingDividends.map((h) => (
              <div key={h.ticker} className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-foreground w-12 shrink-0">
                  {h.ticker}
                </span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
                  <div
                    className="h-full bg-emerald-500/70 rounded transition-all"
                    style={{ width: `${(h.estAnnualIncome / maxIncome) * 100}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono text-foreground">
                    {formatAmount(h.estAnnualIncome)}/yr
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logged payments */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="p-3 border-b border-border">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Logged Payments
          </h2>
        </div>

        {logsLoading ? (
          <div className="p-3 space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        ) : dividendLogs.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No payments logged yet — add your first dividend payment
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {[...dividendLogs]
              .sort(
                (a, b) =>
                  new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
              )
              .map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors"
                  data-testid={`row-divlog-${log.id}`}
                >
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {log.received_date}
                  </span>
                  <span className="font-mono font-bold text-sm text-foreground shrink-0">
                    {log.ticker}
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold shrink-0">
                    +{formatAmount(log.amount_usd)}
                  </span>
                  {log.notes && (
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {log.notes}
                    </span>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(log.id)}
                    className="shrink-0 p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors ml-auto"
                    data-testid={`button-delete-div-${log.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

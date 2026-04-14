import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Holding } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { HeaderBar } from "@/components/header-bar";
import { SummaryCards } from "@/components/summary-cards";
import { BddBreakdown } from "@/components/bdd-breakdown";
import { SectorBreakdown } from "@/components/sector-breakdown";
import { HoldingsTable } from "@/components/holdings-table";
import { HoldingDialog } from "@/components/holding-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sun, TrendingUp, TrendingDown } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { fmtPct, pnlColor } from "@/components/format";

export type PriceData = Record<string, {
  price?: number;
  changesPercentage?: number;
  changePercentage?: number;
  change?: number;
  dayLow?: number;
  dayHigh?: number;
  yearLow?: number;
  yearHigh?: number;
  marketCap?: number;
  volume?: number;
  avgVolume?: number;
  name?: string;
  symbol?: string;
  previousClose?: number;
}>;

type SortOption = "mktValue" | "weight" | "totalReturn" | "dayChange" | "tickerAZ";

interface BuyDecision {
  ticker: string;
  score: number;
  badge: string;
  badgeClass: string;
  reasons: string[];
}

export default function Dashboard() {
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const [bddFilter, setBddFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("mktValue");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [todayOpen, setTodayOpen] = useState(false);
  const [todayPrices, setTodayPrices] = useState<PriceData | null>(null);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayTime, setTodayTime] = useState<string | null>(null);

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  const { data: prices = {} as PriceData, isLoading: pricesLoading, refetch: refetchPrices } = useQuery<PriceData>({
    queryKey: ["/api/prices"],
    staleTime: 60000,
  });

  const { data: buyDecisions = [] } = useQuery<BuyDecision[]>({
    queryKey: ["/api/buy-decision"],
    staleTime: 300000, // 5 min
  });

  const buyDecisionMap = useMemo(() => {
    const m = new Map<string, BuyDecision>();
    for (const d of buyDecisions) m.set(d.ticker, d);
    return m;
  }, [buyDecisions]);

  const enrichedHoldings = useMemo(() => {
    return holdings.map((h) => {
      const p = prices[h.ticker];
      const currentPrice = p?.price ?? 0;
      const mktValue = currentPrice * h.shares;
      const costBasis = h.avg_cost * h.shares;
      const pnl = mktValue - costBasis;
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      const dayChangePct = p?.changesPercentage ?? p?.changePercentage ?? 0;
      const dayChangeDollar = (p?.change ?? 0) * h.shares;
      return { ...h, currentPrice, mktValue, costBasis, pnl, pnlPct, dayChangePct, dayChangeDollar };
    });
  }, [holdings, prices]);

  const totalMktValue = useMemo(() => enrichedHoldings.reduce((s, h) => s + h.mktValue, 0), [enrichedHoldings]);
  const totalCostBasis = useMemo(() => enrichedHoldings.reduce((s, h) => s + h.costBasis, 0), [enrichedHoldings]);
  const totalPnl = totalMktValue - totalCostBasis;
  const totalPnlPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;
  const totalDayChange = useMemo(() => enrichedHoldings.reduce((s, h) => s + h.dayChangeDollar, 0), [enrichedHoldings]);

  const filtered = useMemo(() => {
    let list = enrichedHoldings;
    if (bddFilter) list = list.filter((h) => h.bdd_type === bddFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (h) => h.ticker.toLowerCase().includes(q) || h.sector.toLowerCase().includes(q) || h.notes.toLowerCase().includes(q)
      );
    }
    return list;
  }, [enrichedHoldings, bddFilter, searchQuery]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sortBy) {
      case "mktValue": return copy.sort((a, b) => b.mktValue - a.mktValue);
      case "weight": return copy.sort((a, b) => { const wA = totalMktValue > 0 ? a.mktValue / totalMktValue : 0; const wB = totalMktValue > 0 ? b.mktValue / totalMktValue : 0; return wB - wA; });
      case "totalReturn": return copy.sort((a, b) => b.pnlPct - a.pnlPct);
      case "dayChange": return copy.sort((a, b) => b.dayChangePct - a.dayChangePct);
      case "tickerAZ": return copy.sort((a, b) => a.ticker.localeCompare(b.ticker));
      default: return copy;
    }
  }, [filtered, sortBy, totalMktValue]);

  const handleRefresh = async () => {
    await refetchPrices();
    toast({ title: "Prices refreshed" });
  };

  const handleAdd = () => { setEditingHolding(null); setDialogOpen(true); };
  const handleEdit = (h: Holding) => { setEditingHolding(h); setDialogOpen(true); };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/holdings/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prices"] });
      toast({ title: "Holding deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleSave = async (data: any) => {
    try {
      if (editingHolding) {
        await apiRequest("PATCH", `/api/holdings/${editingHolding.id}`, data);
        toast({ title: "Holding updated" });
      } else {
        await apiRequest("POST", "/api/holdings", data);
        toast({ title: "Holding added" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prices"] });
      setDialogOpen(false);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  const handleTodayOpen = async () => {
    setTodayOpen(true);
    if (!todayPrices) {
      setTodayLoading(true);
      try {
        const res = await apiRequest("GET", "/api/prices");
        const data = await res.json();
        setTodayPrices(data);
        setTodayTime(new Date().toLocaleTimeString());
      } catch {
        toast({ title: "Failed to load intraday data", variant: "destructive" });
      }
      setTodayLoading(false);
    }
  };

  // Intraday report data
  const intradayData = useMemo(() => {
    if (!todayPrices) return [];
    return holdings.map((h) => {
      const q = todayPrices[h.ticker];
      const dayPct = q?.changesPercentage ?? q?.changePercentage ?? 0;
      const dayDollar = (q?.change ?? 0) * h.shares;
      const price = q?.price ?? 0;
      return { ticker: h.ticker, dayPct, dayDollar, price, shares: h.shares };
    }).sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct));
  }, [todayPrices, holdings]);

  const totalDayPnL = intradayData.reduce((s, r) => s + r.dayDollar, 0);
  const biggestWinner = intradayData[0];
  const biggestLoser = intradayData[intradayData.length - 1];

  const isLoading = holdingsLoading || pricesLoading;

  return (
    <div>
      <HeaderBar
        onRefresh={handleRefresh}
        onAdd={handleAdd}
        isLoading={pricesLoading}
        onTodayClick={handleTodayOpen}
      />
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : (
          <>
            <SummaryCards
              totalMktValue={totalMktValue}
              totalPnl={totalPnl}
              totalPnlPct={totalPnlPct}
              totalDayChange={totalDayChange}
              totalCostBasis={totalCostBasis}
              positionCount={holdings.length}
            />
            <BddBreakdown
              enrichedHoldings={enrichedHoldings}
              totalMktValue={totalMktValue}
              activeFilter={bddFilter}
              onFilterChange={(t) => setBddFilter(bddFilter === t ? null : t)}
            />
            <SectorBreakdown enrichedHoldings={enrichedHoldings} totalMktValue={totalMktValue} />
            <HoldingsTable
              holdings={sorted}
              totalMktValue={totalMktValue}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onEdit={handleEdit}
              onDelete={handleDelete}
              buyDecisionMap={buyDecisionMap}
            />
          </>
        )}
      </div>

      <footer className="py-4 text-center">
        <p className="text-xs text-muted-foreground" data-testid="text-footer">
          Prices via Financial Modeling Prep · Live data · Click BDD cards to filter
        </p>
      </footer>

      <HoldingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        holding={editingHolding}
        onSave={handleSave}
      />

      {/* Intraday Report Sheet */}
      <Sheet open={todayOpen} onOpenChange={setTodayOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-background border-border overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <Sun className="w-4 h-4 text-amber-400" />
              Today's Intraday Report
            </SheetTitle>
          </SheetHeader>

          {todayLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded-lg bg-card border border-border p-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground">Day P&L</div>
                  <div className={`font-mono text-sm font-semibold ${pnlColor(totalDayPnL)}`}>
                    {totalDayPnL >= 0 ? "+" : ""}{formatAmount(totalDayPnL, true)}
                  </div>
                </div>
                {biggestWinner && (
                  <div className="rounded-lg bg-card border border-emerald-500/20 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-400" /> Winner
                    </div>
                    <div className="font-mono text-xs font-semibold text-emerald-400">{biggestWinner.ticker}</div>
                    <div className="font-mono text-[10px] text-emerald-400">{fmtPct(biggestWinner.dayPct)}</div>
                  </div>
                )}
                {biggestLoser && (
                  <div className="rounded-lg bg-card border border-red-500/20 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                      <TrendingDown className="w-3 h-3 text-red-400" /> Loser
                    </div>
                    <div className="font-mono text-xs font-semibold text-red-400">{biggestLoser.ticker}</div>
                    <div className="font-mono text-[10px] text-red-400">{fmtPct(biggestLoser.dayPct)}</div>
                  </div>
                )}
              </div>

              {todayTime && (
                <p className="text-[10px] text-muted-foreground mb-3">Updated: {todayTime}</p>
              )}

              {/* Holdings list */}
              <div className="space-y-1.5">
                {intradayData.map((row) => (
                  <div
                    key={row.ticker}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                    data-testid={`row-intraday-${row.ticker}`}
                  >
                    <div>
                      <span className="font-mono font-semibold text-sm">{row.ticker}</span>
                      <div className="text-[10px] text-muted-foreground font-mono">{formatAmount(row.price)}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono text-sm font-semibold ${pnlColor(row.dayPct)}`}>
                        {fmtPct(row.dayPct)}
                      </div>
                      <div className={`font-mono text-[10px] ${pnlColor(row.dayDollar)}`}>
                        {row.dayDollar >= 0 ? "+" : ""}{formatAmount(row.dayDollar, true)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

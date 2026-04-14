import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, Search } from "lucide-react";
import { fmtPct, fmtShares, pnlColor, BDD_COLORS, bddLabel } from "./format";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Link } from "wouter";
import type { Holding } from "@shared/schema";

interface EnrichedHolding extends Holding {
  currentPrice: number;
  mktValue: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
  dayChangePct: number;
  dayChangeDollar: number;
}

type SortOption = "mktValue" | "weight" | "totalReturn" | "dayChange" | "tickerAZ";

// Buy Decision signal types
export interface BuyDecision {
  ticker: string;
  score: number;
  label: string;
}

// Badge colors for buy decision signal
function signalBadge(label: string): { bg: string; text: string } {
  switch (label) {
    case "Strong Buy": return { bg: "bg-emerald-500/20", text: "text-emerald-400" };
    case "Buy":        return { bg: "bg-teal-500/20",    text: "text-teal-400" };
    case "Watch":      return { bg: "bg-amber-500/20",   text: "text-amber-400" };
    case "Review":     return { bg: "bg-orange-500/20",  text: "text-orange-400" };
    case "Trim":       return { bg: "bg-red-500/20",     text: "text-red-400" };
    default:           return { bg: "bg-zinc-500/20",    text: "text-zinc-400" };
  }
}

interface HoldingsTableProps {
  holdings: EnrichedHolding[];
  totalMktValue: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: SortOption;
  onSortChange: (s: SortOption) => void;
  onEdit: (h: Holding) => void;
  onDelete: (id: number) => void;
  buyDecisionMap?: Map<string, BuyDecision>;
}

export function HoldingsTable({
  holdings,
  totalMktValue,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  onEdit,
  onDelete,
  buyDecisionMap,
}: HoldingsTableProps) {
  const { formatAmount } = useCurrency();

  const handleDelete = (id: number, ticker: string) => {
    if (window.confirm?.(`Delete ${ticker}?`) !== false) {
      onDelete(id);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card" data-testid="holdings-table">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search ticker, sector, notes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs bg-muted/50 border-transparent"
            data-testid="input-search"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
          <SelectTrigger className="h-8 w-full sm:w-44 text-xs" data-testid="select-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mktValue">Market Value</SelectItem>
            <SelectItem value="weight">Weight %</SelectItem>
            <SelectItem value="totalReturn">Total Return %</SelectItem>
            <SelectItem value="dayChange">Day Change %</SelectItem>
            <SelectItem value="tickerAZ">Ticker A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left font-medium p-2.5 pl-3.5">Ticker</th>
              <th className="text-right font-medium p-2.5">Price</th>
              <th className="text-right font-medium p-2.5">Day %</th>
              <th className="text-right font-medium p-2.5">Mkt Value</th>
              <th className="text-right font-medium p-2.5">P&L</th>
              <th className="text-right font-medium p-2.5">Weight</th>
              <th className="text-center font-medium p-2.5">Type</th>
              {buyDecisionMap && (
                <th className="text-center font-medium p-2.5">Signal</th>
              )}
              <th className="text-right font-medium p-2.5 pr-3.5 w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const weight = totalMktValue > 0 ? (h.mktValue / totalMktValue) * 100 : 0;
              const colors = BDD_COLORS[h.bdd_type] || BDD_COLORS.engine;
              const signal = buyDecisionMap?.get(h.ticker);

              return (
                <tr
                  key={h.id}
                  className="border-b border-border/50 hover:bg-muted/20 group transition-colors"
                  data-testid={`row-holding-${h.id}`}
                >
                  <td className="p-2.5 pl-3.5">
                    <Link
                      href={`/stock/${h.ticker}`}
                      className="font-mono font-semibold text-primary hover:underline cursor-pointer"
                    >
                      {h.ticker}
                    </Link>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                      {h.sector}
                    </div>
                  </td>
                  <td className="p-2.5 text-right">
                    <div className="font-mono">{formatAmount(h.currentPrice)}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      avg {formatAmount(h.avg_cost)}
                    </div>
                  </td>
                  <td className="p-2.5 text-right">
                    <span className={`font-mono ${pnlColor(h.dayChangePct)}`}>
                      {fmtPct(h.dayChangePct)}
                    </span>
                  </td>
                  <td className="p-2.5 text-right">
                    <div className="font-mono">{formatAmount(h.mktValue)}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {fmtShares(h.shares)} shr
                    </div>
                  </td>
                  <td className="p-2.5 text-right">
                    <div className={`font-mono ${pnlColor(h.pnl)}`}>
                      {h.pnl >= 0 ? "+" : ""}{formatAmount(h.pnl)}
                    </div>
                    <div className={`text-[10px] font-mono ${pnlColor(h.pnlPct)}`}>
                      {fmtPct(h.pnlPct)}
                    </div>
                  </td>
                  <td className="p-2.5 text-right">
                    <div className="font-mono">{weight.toFixed(1)}%</div>
                    <div className="mt-1 h-1 w-full max-w-[48px] ml-auto rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/60"
                        style={{ width: `${Math.min(weight * 3, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}
                    >
                      {bddLabel(h.bdd_type)}
                    </span>
                  </td>
                  {buyDecisionMap && (
                    <td className="p-2.5 text-center">
                      {signal ? (
                        <span
                          className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${signalBadge(signal.label).bg} ${signalBadge(signal.label).text}`}
                          data-testid={`signal-${h.ticker}`}
                          title={`Score: ${signal.score}`}
                        >
                          {signal.label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  <td className="p-2.5 pr-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEdit(h)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        data-testid={`button-edit-${h.id}`}
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(h.id, h.ticker)}
                        className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                        data-testid={`button-delete-${h.id}`}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden divide-y divide-border/50">
        {holdings.map((h) => {
          const weight = totalMktValue > 0 ? (h.mktValue / totalMktValue) * 100 : 0;
          const colors = BDD_COLORS[h.bdd_type] || BDD_COLORS.engine;
          const signal = buyDecisionMap?.get(h.ticker);

          return (
            <div key={h.id} className="p-3 space-y-2" data-testid={`card-holding-${h.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/stock/${h.ticker}`}
                    className="font-mono font-semibold text-sm text-primary hover:underline cursor-pointer"
                  >
                    {h.ticker}
                  </Link>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}
                  >
                    {bddLabel(h.bdd_type)}
                  </span>
                  {signal && (
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${signalBadge(signal.label).bg} ${signalBadge(signal.label).text}`}
                    >
                      {signal.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEdit(h)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                    data-testid={`button-edit-mobile-${h.id}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(h.id, h.ticker)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                    data-testid={`button-delete-mobile-${h.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">{h.sector}</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] text-muted-foreground">Price</div>
                  <div className="font-mono text-xs">{formatAmount(h.currentPrice)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Mkt Value</div>
                  <div className="font-mono text-xs">{formatAmount(h.mktValue)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">P&L</div>
                  <div className={`font-mono text-xs ${pnlColor(h.pnl)}`}>
                    {h.pnl >= 0 ? "+" : ""}{formatAmount(h.pnl)}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className={`font-mono ${pnlColor(h.dayChangePct)}`}>
                  Day: {fmtPct(h.dayChangePct)}
                </span>
                <span className="font-mono text-muted-foreground">
                  Weight: {weight.toFixed(1)}%
                </span>
                <span className={`font-mono ${pnlColor(h.pnlPct)}`}>
                  Return: {fmtPct(h.pnlPct)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {holdings.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground" data-testid="text-empty">
          No holdings found
        </div>
      )}
    </div>
  );
}

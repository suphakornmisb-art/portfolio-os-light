import { fmtPct, pnlColor } from "./format";
import { useCurrency } from "@/contexts/CurrencyContext";
import { TrendingUp, TrendingDown, BarChart3, Activity, Wallet } from "lucide-react";

interface SummaryCardsProps {
  totalMktValue: number;
  totalPnl: number;
  totalPnlPct: number;
  totalDayChange: number;
  totalCostBasis: number;
  positionCount: number;
}

function SummaryCard({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}

export function SummaryCards({
  totalMktValue,
  totalPnl,
  totalPnlPct,
  totalDayChange,
  totalCostBasis,
  positionCount,
}: SummaryCardsProps) {
  const { formatAmount } = useCurrency();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="summary-cards">
      <SummaryCard label="Market Value" icon={BarChart3}>
        <div className="font-mono text-lg font-semibold" data-testid="text-market-value">
          {formatAmount(totalMktValue, true)}
        </div>
        <div className="text-xs text-muted-foreground font-mono mt-0.5">
          {positionCount} positions
        </div>
      </SummaryCard>

      <SummaryCard label="Total P&L" icon={totalPnl >= 0 ? TrendingUp : TrendingDown}>
        <div className={`font-mono text-lg font-semibold ${pnlColor(totalPnl)}`} data-testid="text-total-pnl">
          {totalPnl >= 0 ? "+" : ""}{formatAmount(totalPnl, true)}
        </div>
        <div className={`text-xs font-mono mt-0.5 ${pnlColor(totalPnlPct)}`}>
          {fmtPct(totalPnlPct)}
        </div>
      </SummaryCard>

      <SummaryCard label="Today's P&L" icon={Activity}>
        <div className={`font-mono text-lg font-semibold ${pnlColor(totalDayChange)}`} data-testid="text-day-pnl">
          {totalDayChange >= 0 ? "+" : ""}{formatAmount(totalDayChange, true)}
        </div>
        <div className={`text-xs font-mono mt-0.5 ${pnlColor(totalDayChange)}`}>
          {totalDayChange >= 0 ? "▲" : "▼"} today
        </div>
      </SummaryCard>

      <SummaryCard label="Cost Basis" icon={Wallet}>
        <div className="font-mono text-lg font-semibold" data-testid="text-cost-basis">
          {formatAmount(totalCostBasis, true)}
        </div>
        <div className="text-xs text-muted-foreground font-mono mt-0.5">
          total invested
        </div>
      </SummaryCard>
    </div>
  );
}

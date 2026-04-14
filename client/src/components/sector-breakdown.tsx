import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fmtPct } from "./format";

interface EnrichedHolding {
  sector: string;
  mktValue: number;
  [key: string]: any;
}

interface SectorBreakdownProps {
  enrichedHoldings: EnrichedHolding[];
  totalMktValue: number;
}

const SECTOR_COLORS: Record<string, string> = {
  "Information Technology": "#3b82f6",
  "Financials": "#10b981",
  "Communication Services": "#f59e0b",
  "Consumer Discretionary": "#a855f7",
  "Health Care": "#ef4444",
  "Industrials": "#06b6d4",
  "Consumer Staples": "#84cc16",
  "Materials": "#f97316",
  "Real Estate": "#ec4899",
  "Utilities": "#14b8a6",
  "ETF - Dividend Equity": "#6366f1",
  "ETF - Broad Market": "#8b5cf6",
  "ETF - International Equity": "#0ea5e9",
  "ETF - Growth Equity": "#eab308",
  "ETF - Value Equity": "#22c55e",
};

function getColor(sector: string): string {
  return SECTOR_COLORS[sector] || "#64748b";
}

export function SectorBreakdown({ enrichedHoldings, totalMktValue }: SectorBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  const sectors = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of enrichedHoldings) {
      map.set(h.sector, (map.get(h.sector) || 0) + h.mktValue);
    }
    return Array.from(map.entries())
      .map(([sector, value]) => ({
        sector,
        value,
        weight: totalMktValue > 0 ? (value / totalMktValue) * 100 : 0,
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [enrichedHoldings, totalMktValue]);

  return (
    <div className="rounded-lg border border-border bg-card" data-testid="sector-breakdown">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
        data-testid="button-toggle-sectors"
      >
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Sector Breakdown
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {sectors.map(({ sector, weight }) => (
            <div key={sector} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-36 sm:w-48 truncate shrink-0">
                {sector}
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(weight, 1)}%`,
                    backgroundColor: getColor(sector),
                  }}
                />
              </div>
              <span className="text-xs font-mono text-muted-foreground w-12 text-right shrink-0">
                {weight.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

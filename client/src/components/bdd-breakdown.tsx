import { useMemo } from "react";
import { BDD_COLORS, bddLabel, fmtPct } from "./format";
import { useCurrency } from "@/contexts/CurrencyContext";

interface EnrichedHolding {
  bdd_type: string;
  mktValue: number;
  [key: string]: any;
}

interface BddBreakdownProps {
  enrichedHoldings: EnrichedHolding[];
  totalMktValue: number;
  activeFilter: string | null;
  onFilterChange: (type: string) => void;
}

const BDD_ORDER = ["engine", "grounder", "builder", "moonshot"];

export function BddBreakdown({
  enrichedHoldings,
  totalMktValue,
  activeFilter,
  onFilterChange,
}: BddBreakdownProps) {
  const { formatAmount } = useCurrency();

  const breakdown = useMemo(() => {
    return BDD_ORDER.map((type) => {
      const items = enrichedHoldings.filter((h) => h.bdd_type === type);
      const value = items.reduce((s, h) => s + h.mktValue, 0);
      const weight = totalMktValue > 0 ? (value / totalMktValue) * 100 : 0;
      return { type, count: items.length, value, weight };
    });
  }, [enrichedHoldings, totalMktValue]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="bdd-breakdown">
      {breakdown.map(({ type, count, value, weight }) => {
        const colors = BDD_COLORS[type];
        const isActive = activeFilter === type;
        return (
          <button
            key={type}
            onClick={() => onFilterChange(type)}
            data-testid={`button-bdd-${type}`}
            className={`rounded-lg border p-3 text-left transition-all ${
              isActive
                ? `${colors.border} ${colors.bg} ring-1 ring-offset-0`
                : "border-border bg-card hover:border-muted-foreground/30"
            }`}
            style={isActive ? { ringColor: colors.hex } : undefined}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}
              >
                {bddLabel(type)}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{count}</span>
            </div>
            <div className="font-mono text-sm font-semibold" data-testid={`text-bdd-value-${type}`}>
              {formatAmount(value, true)}
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${weight}%`, backgroundColor: colors.hex }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mt-1">
              {weight.toFixed(1)}% weight
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function fmtUSD(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function fmtNum(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function fmtShares(value: number): string {
  if (value >= 1) {
    return fmtNum(value, 2);
  }
  return fmtNum(value, 4);
}

export function pnlColor(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-muted-foreground";
}

export const BDD_COLORS: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  engine: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", hex: "#3b82f6" },
  grounder: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", hex: "#10b981" },
  builder: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", hex: "#f59e0b" },
  moonshot: { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30", hex: "#a855f7" },
};

export function bddLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function fmtCurrency(value: number, currency: "USD" | "THB", compact = false): string {
  if (currency === "THB") {
    const absVal = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (compact && absVal >= 1_000_000) {
      return `${sign}฿${(absVal / 1_000_000).toFixed(1)}M`;
    }
    if (compact && absVal >= 1_000) {
      return `${sign}฿${(absVal / 1_000).toFixed(1)}K`;
    }
    return `${sign}฿${new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(absVal)}`;
  }
  return fmtUSD(value, compact);
}

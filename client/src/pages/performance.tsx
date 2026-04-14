import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, TrendingUp, TrendingDown, BarChart3, Shield, ChevronDown } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";

interface PerformanceData {
  twr: number;
  mwr: number;
  daily_values: { date: string; value: number; twr_cumulative: number }[];
  annualized_return: number;
  total_return_pct: number;
  max_drawdown: number;
  inflation_comparison: { date: string; value: number }[];
  beating_inflation: boolean;
}

type Range = "1M" | "3M" | "6M" | "YTD" | "1Y" | "All";

const INFLATION_PRESETS = [2.0, 2.5, 3.0, 3.5, 4.0];

function filterByRange(data: { date: string }[], range: Range): { date: string }[] {
  if (range === "All" || data.length === 0) return data;
  const now = new Date();
  let cutoff: Date;
  switch (range) {
    case "1M": cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break;
    case "3M": cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
    case "6M": cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
    case "YTD": cutoff = new Date(now.getFullYear(), 0, 1); break;
    case "1Y": cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
    default: return data;
  }
  return data.filter((d) => new Date(d.date) >= cutoff);
}

/** Recompute the inflation comparison line from daily_values using a custom annual rate */
function computeInflationLine(
  dailyValues: { date: string; value: number }[],
  annualRate: number,
): { date: string; value: number }[] {
  if (dailyValues.length === 0) return [];
  const startValue = dailyValues[0].value;
  const firstDate = new Date(dailyValues[0].date).getTime();
  return dailyValues.map((dv) => {
    const daysSinceStart = (new Date(dv.date).getTime() - firstDate) / 86400000;
    const inflatedValue = startValue * Math.pow(1 + annualRate / 100, daysSinceStart / 365.25);
    return { date: dv.date, value: Math.round(inflatedValue * 100) / 100 };
  });
}

/** Check if TWR beats inflation over the period */
function isBeatInflation(twr: number, dailyValues: { date: string }[], annualRate: number): boolean {
  if (dailyValues.length < 2) return false;
  const firstDate = new Date(dailyValues[0].date).getTime();
  const lastDate = new Date(dailyValues[dailyValues.length - 1].date).getTime();
  const years = (lastDate - firstDate) / (365.25 * 86400000);
  return twr > years * annualRate;
}

function PerformanceChart({
  perf,
  range,
  inflationRate,
}: {
  perf: PerformanceData;
  range: Range;
  inflationRate: number;
}) {
  // useCurrency must be called outside SVG
  const { convert, symbol } = useCurrency();

  const inflationLine = useMemo(
    () => computeInflationLine(perf.daily_values, inflationRate),
    [perf.daily_values, inflationRate],
  );

  const filteredValues = useMemo(
    () => filterByRange(perf.daily_values, range) as typeof perf.daily_values,
    [perf.daily_values, range],
  );
  const filteredInflation = useMemo(
    () => filterByRange(inflationLine, range) as typeof inflationLine,
    [inflationLine, range],
  );

  if (filteredValues.length < 2) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground rounded-lg border border-border bg-card">
        Not enough data points for this range
      </div>
    );
  }

  const allValues = [...filteredValues.map((v) => v.value), ...filteredInflation.map((v) => v.value)];
  const minVal = Math.min(...allValues) * 0.98;
  const maxVal = Math.max(...allValues) * 1.02;
  const valRange = maxVal - minVal || 1;

  const w = 900;
  const h = 250;
  const padL = 68;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const toX = (i: number, total: number) => padL + (i / Math.max(1, total - 1)) * chartW;
  const toY = (val: number) => padT + (1 - (val - minVal) / valRange) * chartH;

  const twrPath = filteredValues
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i, filteredValues.length)},${toY(v.value)}`)
    .join(" ");

  const inflPath = filteredInflation
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i, filteredInflation.length)},${toY(v.value)}`)
    .join(" ");

  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const val = minVal + (valRange * i) / (yTicks - 1);
    // Convert USD value to selected currency
    const displayVal = convert(val);
    // Format: if >= 1000, show as k; if >= 1_000_000, show as M
    let label: string;
    if (Math.abs(displayVal) >= 1_000_000) {
      label = `${symbol}${(displayVal / 1_000_000).toFixed(1)}M`;
    } else if (Math.abs(displayVal) >= 1_000) {
      label = `${symbol}${(displayVal / 1_000).toFixed(1)}k`;
    } else {
      label = `${symbol}${displayVal.toFixed(0)}`;
    }
    return { val, y: toY(val), label };
  });

  const xLabelCount = Math.min(6, filteredValues.length);
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => {
    const idx = Math.round((i * (filteredValues.length - 1)) / (xLabelCount - 1));
    const date = filteredValues[idx]?.date || "";
    return { label: date.slice(5), x: toX(idx, filteredValues.length) };
  });

  const areaPath =
    twrPath +
    ` L${toX(filteredValues.length - 1, filteredValues.length)},${padT + chartH} L${padL},${padT + chartH} Z`;

  return (
    <div className="rounded-lg border border-border bg-card p-4 overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" style={{ minHeight: 200 }}>
        <defs>
          <linearGradient id="twrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0cd4a0" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0cd4a0" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yLabels.map((yl, i) => (
          <g key={i}>
            <line x1={padL} y1={yl.y} x2={w - padR} y2={yl.y} stroke="hsl(220,10%,16%)" strokeWidth="0.5" />
            <text x={padL - 6} y={yl.y + 3} textAnchor="end" fill="hsl(215,10%,52%)" fontSize="9" fontFamily="JetBrains Mono, monospace">
              {yl.label}
            </text>
          </g>
        ))}

        {xLabels.map((xl, i) => (
          <text key={i} x={xl.x} y={h - 4} textAnchor="middle" fill="hsl(215,10%,52%)" fontSize="9" fontFamily="JetBrains Mono, monospace">
            {xl.label}
          </text>
        ))}

        <path d={areaPath} fill="url(#twrGrad)" />
        {inflPath && (
          <path d={inflPath} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
        )}
        <path d={twrPath} fill="none" stroke="#0cd4a0" strokeWidth="2" strokeLinejoin="round" />

        {filteredValues.length > 0 && (
          <circle
            cx={toX(filteredValues.length - 1, filteredValues.length)}
            cy={toY(filteredValues[filteredValues.length - 1].value)}
            r="3.5"
            fill="#0cd4a0"
            stroke="hsl(220,13%,9%)"
            strokeWidth="2"
          />
        )}
      </svg>

      <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-primary rounded" />
          Portfolio (TWR)
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-red-500 rounded opacity-60" style={{ borderBottom: "1px dashed" }} />
          Inflation ({inflationRate}% annual)
        </div>
      </div>
    </div>
  );
}

function InflationRateControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (rate: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card hover:border-primary/30 transition-colors text-xs"
        data-testid="button-inflation-rate"
      >
        <span className="text-muted-foreground">Inflation:</span>
        <span className="font-mono font-medium text-foreground">{value}%</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute top-full mt-1 right-0 z-50 w-56 rounded-lg border border-border bg-popover p-2 shadow-lg">
            <p className="text-[10px] text-muted-foreground mb-2 px-1">
              US CPI benchmark (3% = Fed long-run target)
            </p>
            <div className="grid grid-cols-5 gap-1 mb-2">
              {INFLATION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => { onChange(preset); setIsOpen(false); }}
                  className={`px-1.5 py-1 text-xs rounded font-mono transition-colors ${
                    value === preset
                      ? "bg-primary/20 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid={`button-inflation-${preset}`}
                >
                  {preset}%
                </button>
              ))}
            </div>
            <div className="border-t border-border pt-2">
              <label className="flex items-center gap-2 px-1">
                <span className="text-[10px] text-muted-foreground shrink-0">Custom:</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={value}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 0 && v <= 20) onChange(v);
                  }}
                  className="w-full bg-input border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="input-inflation-custom"
                />
                <span className="text-[10px] text-muted-foreground shrink-0">%</span>
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PerformancePage() {
  const { toast } = useToast();
  const [range, setRange] = useState<Range>("All");
  const [inflationRate, setInflationRate] = useState(3.0);

  const { data: perf, isLoading: perfLoading } = useQuery<PerformanceData>({
    queryKey: ["/api/performance"],
    staleTime: 60000,
  });

  const snapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/snapshots/auto");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Snapshot recorded" });
      queryClient.invalidateQueries({ queryKey: ["/api/performance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
    },
    onError: () => {
      toast({ title: "Snapshot failed", variant: "destructive" });
    },
  });

  const hasData = perf && perf.daily_values && perf.daily_values.length > 0;
  const ranges: Range[] = ["1M", "3M", "6M", "YTD", "1Y", "All"];

  // Compute "beating inflation" live based on selected rate
  const beatingInflation = useMemo(() => {
    if (!perf || !hasData) return false;
    return isBeatInflation(perf.twr, perf.daily_values, inflationRate);
  }, [perf, hasData, inflationRate]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground" data-testid="text-perf-title">Performance</h2>
          <p className="text-xs text-muted-foreground">Time-weighted & money-weighted returns with inflation comparison</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => snapshotMutation.mutate()}
          disabled={snapshotMutation.isPending}
          data-testid="button-snapshot"
          className="gap-1.5"
        >
          <Camera className={`h-3.5 w-3.5 ${snapshotMutation.isPending ? "animate-pulse" : ""}`} />
          Take Snapshot
        </Button>
      </div>

      {perfLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
          <Skeleton className="h-72 rounded-lg" />
        </div>
      ) : !hasData ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No snapshots yet</p>
          <p className="text-xs text-muted-foreground mb-4">Take your first snapshot to start tracking portfolio performance over time.</p>
          <Button
            size="sm"
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            data-testid="button-first-snapshot"
          >
            Take First Snapshot
          </Button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Return</span>
              </div>
              <span
                className={`font-mono text-lg font-semibold ${perf!.total_return_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                data-testid="text-total-return"
              >
                {perf!.total_return_pct >= 0 ? "+" : ""}{perf!.total_return_pct.toFixed(2)}%
              </span>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Annualized</span>
              </div>
              <span
                className={`font-mono text-lg font-semibold ${perf!.annualized_return >= 0 ? "text-emerald-400" : "text-red-400"}`}
                data-testid="text-annualized"
              >
                {perf!.annualized_return >= 0 ? "+" : ""}{perf!.annualized_return.toFixed(2)}%
              </span>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Drawdown</span>
              </div>
              <span className="font-mono text-lg font-semibold text-red-400" data-testid="text-max-dd">
                -{perf!.max_drawdown.toFixed(2)}%
              </span>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className={`h-3.5 w-3.5 ${beatingInflation ? "text-emerald-400" : "text-amber-400"}`} />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">vs Inflation ({inflationRate}%)</span>
              </div>
              <Badge
                variant="outline"
                className={`font-mono text-xs ${beatingInflation ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}`}
                data-testid="text-inflation"
              >
                {beatingInflation ? "Beating \u2713" : "Behind \u2717"}
              </Badge>
            </div>
          </div>

          {/* Range selector + Inflation control */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {ranges.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    range === r
                      ? "bg-primary/20 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`button-range-${r}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <InflationRateControl value={inflationRate} onChange={setInflationRate} />
          </div>

          {/* Chart */}
          <PerformanceChart perf={perf!} range={range} inflationRate={inflationRate} />

          {/* MWR section */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-foreground">Money-Weighted Return (Modified Dietz)</span>
            </div>
            <span
              className={`font-mono text-xl font-semibold ${perf!.mwr >= 0 ? "text-emerald-400" : "text-red-400"}`}
              data-testid="text-mwr"
            >
              {perf!.mwr >= 0 ? "+" : ""}{perf!.mwr.toFixed(2)}%
            </span>
            <p className="text-[11px] text-muted-foreground mt-1">
              MWR accounts for the timing of your deposits and withdrawals, reflecting your actual dollar-weighted experience.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

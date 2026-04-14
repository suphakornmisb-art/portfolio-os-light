import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/contexts/CurrencyContext";
import { ArrowLeft, TrendingUp, TrendingDown, Globe, Users, Building2, BarChart3, DollarSign, Activity, ExternalLink } from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockDetailData {
  ticker: string;
  profile: {
    name: string;
    description: string;
    sector: string;
    industry: string;
    website: string;
    ceo: string;
    employees: number;
    country: string;
    exchange: string;
    market_cap: number;
    beta: number;
    image: string;
    ipo_date: string;
    is_etf: boolean;
  };
  quote: {
    price: number;
    change: number;
    changes_pct: number;
    day_low: number;
    day_high: number;
    year_low: number;
    year_high: number;
    volume: number;
    avg_volume: number;
    market_cap: number;
    pe: number;
    eps: number;
  };
  profit_bridge: {
    revenue: number;
    cogs: number;
    gross_profit: number;
    operating_expenses: number;
    operating_income: number;
    interest_expense: number;
    tax: number;
    net_income: number;
    fcf: number;
    fiscal_year: number | string;
    gm_pct: number | null;
    om_pct: number | null;
    nm_pct: number | null;
    fcf_pct: number | null;
  };
  key_ratios: {
    pe: number | null;
    pb: number | null;
    ps: number | null;
    pfcf: number | null;
    ev_ebitda: number | null;
    roic: number | null;
    roe: number | null;
    dividend_yield: number | null;
    net_debt_ebitda: number | null;
    current_ratio: number | null;
  };
  margin_trend: Array<{
    year: number | string;
    revenue: number | null;
    cogs: number | null;
    gross_profit: number | null;
    operating_expenses: number | null;
    operating_income: number | null;
    interest_expense: number | null;
    income_tax: number | null;
    net_income: number | null;
    fcf: number | null;
    gm: number | null;
    om: number | null;
    nm: number | null;
    fcfm: number | null;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(decimals)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtRaw(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function pnlColor(n: number | null | undefined): string {
  if (n == null) return "text-muted-foreground";
  return n >= 0 ? "text-emerald-400" : "text-red-400";
}

// ─── Profit Bridge Chart ──────────────────────────────────────────────────────

function ProfitBridge({ bridge }: { bridge: StockDetailData["profit_bridge"] }) {
  const rev = bridge.revenue || 1;
  const items = [
    { label: "Revenue", value: bridge.revenue, pct: 100, color: "bg-sky-500" },
    { label: "– COGS", value: -(bridge.cogs || 0), pct: rev > 0 ? -((bridge.cogs || 0) / rev) * 100 : 0, color: "bg-rose-500/70" },
    { label: "Gross Profit", value: bridge.gross_profit, pct: bridge.gm_pct, color: "bg-teal-500" },
    { label: "– OpEx", value: -(bridge.operating_expenses || 0), pct: rev > 0 ? -((bridge.operating_expenses || 0) / rev) * 100 : 0, color: "bg-rose-500/70" },
    { label: "Op. Income", value: bridge.operating_income, pct: bridge.om_pct, color: "bg-emerald-500" },
    { label: "– Interest", value: -(bridge.interest_expense || 0), pct: rev > 0 ? -((bridge.interest_expense || 0) / rev) * 100 : 0, color: "bg-rose-500/40" },
    { label: "– Tax", value: -(bridge.tax || 0), pct: rev > 0 ? -((bridge.tax || 0) / rev) * 100 : 0, color: "bg-rose-500/40" },
    { label: "Net Income", value: bridge.net_income, pct: bridge.nm_pct, color: "bg-violet-500" },
    { label: "Free Cash Flow", value: bridge.fcf, pct: bridge.fcf_pct, color: "bg-amber-500" },
  ];

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const absPct = Math.abs(item.pct || 0);
        const isNeg = (item.pct || 0) < 0;
        return (
          <div key={item.label} className="flex items-center gap-3 text-xs">
            <div className="w-28 shrink-0 text-right text-muted-foreground font-mono text-[11px]">
              {item.label}
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 relative h-5 bg-muted/40 rounded-sm overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded-sm ${item.color} transition-all`}
                  style={{ width: `${Math.min(absPct, 100)}%`, opacity: isNeg ? 0.6 : 1 }}
                />
              </div>
              <span className={`w-14 text-right font-mono shrink-0 ${pnlColor(item.value)}`}>
                ${fmt(item.value)}
              </span>
              <span className={`w-12 text-right font-mono shrink-0 text-[11px] ${pnlColor(item.pct)}`}>
                {item.pct != null ? `${item.pct.toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Margin Trend Mini Chart ──────────────────────────────────────────────────

function MarginTrendChart({ trend }: { trend: StockDetailData["margin_trend"] }) {
  if (!trend || trend.length < 2) {
    return <p className="text-xs text-muted-foreground text-center py-4">Insufficient data</p>;
  }

  const metrics = [
    { key: "gm" as const, label: "Gross", color: "#14b8a6" },
    { key: "om" as const, label: "Operating", color: "#6366f1" },
    { key: "nm" as const, label: "Net", color: "#a855f7" },
    { key: "fcfm" as const, label: "FCF", color: "#f59e0b" },
  ];

  // Find max/min across all metrics for y-scale
  const allVals = trend.flatMap(d => metrics.map(m => d[m.key] ?? 0)).filter(v => !isNaN(v));
  const maxVal = Math.max(...allVals, 0);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;
  const pad = range * 0.15;
  const yMax = maxVal + pad;
  const yMin = minVal - pad;
  const yRange = yMax - yMin;

  const W = 480;
  const H = 160;
  const padL = 36;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const xPos = (i: number) => padL + (i / (trend.length - 1)) * chartW;
  const yPos = (v: number) => padT + ((yMax - v) / yRange) * chartH;

  const zeroPx = yPos(0);

  function makePath(key: typeof metrics[0]["key"]): string {
    const pts = trend.map((d, i) => {
      const v = d[key];
      if (v == null) return null;
      return `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`;
    }).filter(Boolean);
    if (pts.length < 2) return "";
    return `M ${pts.join(" L ")}`;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
        {/* Zero line */}
        {zeroPx > padT && zeroPx < padT + chartH && (
          <line x1={padL} x2={W - padR} y1={zeroPx} y2={zeroPx} stroke="#444" strokeDasharray="3 3" strokeWidth="0.5" />
        )}
        {/* Grid lines */}
        {[25, 50, 75].map(pct => {
          const y = padT + (pct / 100) * chartH;
          const v = yMax - (pct / 100) * yRange;
          return (
            <g key={pct}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#333" strokeWidth="0.5" />
              <text x={padL - 4} y={y + 3} textAnchor="end" fill="#666" fontSize={9}>{v.toFixed(0)}%</text>
            </g>
          );
        })}
        {/* Metric lines */}
        {metrics.map(m => {
          const d = makePath(m.key);
          if (!d) return null;
          return (
            <path key={m.key} d={d} fill="none" stroke={m.color} strokeWidth="1.5" strokeLinejoin="round" />
          );
        })}
        {/* Data points */}
        {metrics.map(m =>
          trend.map((d, i) => {
            const v = d[m.key];
            if (v == null) return null;
            return (
              <circle key={`${m.key}-${i}`} cx={xPos(i)} cy={yPos(v)} r={2.5} fill={m.color} />
            );
          })
        )}
        {/* X axis labels */}
        {trend.map((d, i) => (
          <text key={i} x={xPos(i)} y={H - 6} textAnchor="middle" fill="#666" fontSize={9}>
            {String(d.year).slice(-2)}
          </text>
        ))}
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-1 flex-wrap">
        {metrics.map(m => (
          <div key={m.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: m.color }} />
            {m.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Revenue Bars ─────────────────────────────────────────────────────────────

function RevenueHistory({ trend }: { trend: StockDetailData["margin_trend"] }) {
  if (!trend || trend.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No data</p>;
  }
  const maxRev = Math.max(...trend.map(d => d.revenue || 0), 1);
  return (
    <div className="flex items-end gap-2 h-28">
      {trend.map((d, i) => {
        const h = d.revenue ? (d.revenue / maxRev) * 100 : 0;
        const prev = i > 0 ? trend[i - 1].revenue : null;
        const isGrowth = prev != null && d.revenue != null && d.revenue > prev;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <span className="text-[9px] font-mono text-muted-foreground">${fmt(d.revenue)}</span>
            <div className="w-full flex items-end" style={{ height: 72 }}>
              <div
                className={`w-full rounded-t-sm transition-all ${isGrowth ? "bg-sky-500/80" : "bg-sky-500/40"}`}
                style={{ height: `${h}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground font-mono">{String(d.year).slice(-2)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Key Ratio Card ───────────────────────────────────────────────────────────

function RatioCard({ label, value, note, highlight }: { label: string; value: string; note?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 space-y-0.5 ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-mono font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
      {note && <div className="text-[10px] text-muted-foreground">{note}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = params.ticker?.toUpperCase() || "";
  const { formatAmount } = useCurrency();

  const { data, isLoading, isError, error } = useQuery<StockDetailData>({
    queryKey: ["/api/stock", ticker, "detail"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/stock/${ticker}/detail`);
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(e.error || r.statusText);
      }
      return r.json();
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  if (!ticker) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">No ticker specified.</div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse max-w-4xl mx-auto py-4">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-32 bg-muted rounded" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-64 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
        <div className="h-48 bg-muted rounded" />
      </div>
    );
  }

  if (isError || !data) {
    const msg = (error as Error)?.message || "Failed to load stock data";
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-sm text-red-400">{msg}</p>
        <Link href="/" className="text-xs text-primary hover:underline">← Back to Portfolio</Link>
      </div>
    );
  }

  const { profile, quote, profit_bridge, key_ratios, margin_trend } = data;
  const isUp = (quote.changes_pct || 0) >= 0;

  return (
    <div className="max-w-4xl mx-auto space-y-5 py-2" data-testid="stock-detail-page">

      {/* Back navigation */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group" data-testid="link-back">
        <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
        Portfolio
      </Link>

      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 rounded-xl border border-border bg-card p-4">
        {/* Logo + name */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {profile.image && (
            <img
              src={profile.image}
              alt={ticker}
              className="w-12 h-12 rounded-xl object-contain bg-muted/30 p-1 shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-xl text-foreground" data-testid="text-ticker">{ticker}</span>
              {profile.exchange && (
                <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded font-mono">{profile.exchange}</span>
              )}
              {profile.is_etf && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">ETF</span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground mt-0.5 leading-tight">{profile.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{profile.sector} · {profile.industry}</p>
          </div>
        </div>

        {/* Price block */}
        <div className="shrink-0 text-right">
          <div className="text-2xl font-mono font-bold text-foreground" data-testid="text-price">
            ${quote.price != null ? quote.price.toFixed(2) : "—"}
          </div>
          <div className={`flex items-center gap-1 justify-end text-sm font-mono font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`} data-testid="text-change">
            {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {quote.change != null ? (quote.change >= 0 ? "+" : "") + quote.change.toFixed(2) : "—"}
            {" "}({fmtPct(quote.changes_pct)})
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">
            52w: ${quote.year_low?.toFixed(2) || "—"} – ${quote.year_high?.toFixed(2) || "—"}
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <RatioCard label="Market Cap" value={`$${fmt(quote.market_cap)}`} />
        <RatioCard label="P/E Ratio" value={quote.pe != null ? fmtRaw(quote.pe) : "—"} />
        <RatioCard label="EPS (TTM)" value={quote.eps != null ? `$${fmtRaw(quote.eps)}` : "—"} />
        <RatioCard label="Beta" value={profile.beta != null ? fmtRaw(profile.beta) : "—"} note="Market sensitivity" />
      </div>

      {/* Business Summary */}
      {profile.description && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="card-business-summary">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Business Summary
          </h2>
          <BusinessDescription text={profile.description} />
          {/* Meta row */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
            {profile.ceo && (
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> CEO: {profile.ceo}</span>
            )}
            {profile.employees && (
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {Number(profile.employees).toLocaleString()} employees</span>
            )}
            {profile.country && (
              <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {profile.country}</span>
            )}
            {profile.ipo_date && (
              <span>IPO: {profile.ipo_date}</span>
            )}
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Website
              </a>
            )}
          </div>
        </div>
      )}

      {/* Revenue History */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="card-revenue-history">
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-sky-400" />
          Revenue History (5Y)
        </h2>
        <RevenueHistory trend={margin_trend} />
      </div>

      {/* Profit Bridge + Margin Trend side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Profit Bridge */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="card-profit-bridge">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            Profit Bridge
            {profit_bridge.fiscal_year && (
              <span className="ml-auto text-[10px] font-normal text-muted-foreground font-mono">FY{profit_bridge.fiscal_year}</span>
            )}
          </h2>
          <ProfitBridge bridge={profit_bridge} />
        </div>

        {/* Margin Trend */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="card-margin-trend">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-violet-400" />
            Margin Trend (5Y)
          </h2>
          <MarginTrendChart trend={margin_trend} />
        </div>
      </div>

      {/* Key Ratios Grid */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="card-key-ratios">
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
          Key Economic Ratios
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          <RatioCard label="P/E" value={fmtRaw(key_ratios.pe)} note="Price / Earnings" highlight={key_ratios.pe != null && key_ratios.pe < 25} />
          <RatioCard label="P/B" value={fmtRaw(key_ratios.pb)} note="Price / Book" />
          <RatioCard label="P/S" value={fmtRaw(key_ratios.ps)} note="Price / Sales" />
          <RatioCard label="P/FCF" value={fmtRaw(key_ratios.pfcf)} note="Price / Free Cash Flow" />
          <RatioCard label="EV/EBITDA" value={fmtRaw(key_ratios.ev_ebitda)} note="Enterprise multiple" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-1">
          <RatioCard label="ROIC" value={key_ratios.roic != null ? `${fmtRaw(key_ratios.roic)}%` : "—"} note="Return on Invested Capital" highlight={key_ratios.roic != null && key_ratios.roic > 15} />
          <RatioCard label="ROE" value={key_ratios.roe != null ? `${fmtRaw(key_ratios.roe)}%` : "—"} note="Return on Equity" />
          <RatioCard label="Div. Yield" value={key_ratios.dividend_yield != null ? `${fmtRaw(key_ratios.dividend_yield)}%` : "—"} note="Annual dividend %" />
          <RatioCard label="Net Debt/EBITDA" value={fmtRaw(key_ratios.net_debt_ebitda)} note="Leverage ratio" />
          <RatioCard label="Current Ratio" value={fmtRaw(key_ratios.current_ratio)} note="Liquidity" highlight={key_ratios.current_ratio != null && key_ratios.current_ratio > 1.5} />
        </div>
      </div>

      {/* Day Range + Volume */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="card-trading-info">
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Trading Info</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <RatioCard label="Day Low" value={`$${quote.day_low?.toFixed(2) || "—"}`} />
          <RatioCard label="Day High" value={`$${quote.day_high?.toFixed(2) || "—"}`} />
          <RatioCard label="Volume" value={fmt(quote.volume, 2)} />
          <RatioCard label="Avg Volume" value={fmt(quote.avg_volume, 2)} />
        </div>
        {/* Day range bar */}
        {quote.day_low != null && quote.day_high != null && quote.price != null && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>${quote.day_low.toFixed(2)}</span>
              <span>Today's Range</span>
              <span>${quote.day_high.toFixed(2)}</span>
            </div>
            <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`absolute h-full rounded-full ${isUp ? "bg-emerald-500" : "bg-red-500"}`}
                style={{
                  left: 0,
                  width: quote.day_high > quote.day_low
                    ? `${((quote.price - quote.day_low) / (quote.day_high - quote.day_low)) * 100}%`
                    : "50%"
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-[10px] text-muted-foreground text-center pb-2">
        Data from Financial Modeling Prep · For educational purposes only · Not financial advice
      </p>
    </div>
  );
}

// ─── Business Description with Read More ─────────────────────────────────────

function BusinessDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const LIMIT = 280;
  const short = text.length > LIMIT && !expanded;

  return (
    <div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {short ? text.slice(0, LIMIT) + "…" : text}
      </p>
      {text.length > LIMIT && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[11px] text-primary hover:underline mt-1"
          data-testid="button-toggle-description"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

// Need React import for useState in BusinessDescription
import React from "react";

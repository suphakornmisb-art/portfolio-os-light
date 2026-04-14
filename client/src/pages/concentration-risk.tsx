import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Holding } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { PriceData } from "@/pages/dashboard";
import { AlertTriangle, Layers } from "lucide-react";

// ─── Theme Map ────────────────────────────────────────────────────────────────

const THEME_MAP: Record<string, string[]> = {
  "Cloud Infrastructure": ["MSFT", "AMZN", "GOOGL", "NET", "CRM", "SNOW", "DDOG", "MDB", "ORCL", "IBM"],
  "AI / Semiconductors": ["NVDA", "AMD", "INTC", "AVGO", "QCOM", "TSM", "ASML", "ARM", "SMCI"],
  "Consumer Internet": ["META", "GOOGL", "SNAP", "PINS", "UBER", "LYFT", "ABNB", "BKNG", "EXPE"],
  "Payments & Fintech": ["V", "MA", "PYPL", "SQ", "ADYEY", "GPN", "FIS", "FI", "AFRM"],
  "E-Commerce": ["AMZN", "SHOP", "EBAY", "ETSY", "BABA", "JD", "PDD", "MELI"],
  "Healthcare": ["UNH", "JNJ", "PFE", "ABBV", "MRK", "LLY", "BMY", "AMGN", "GILD", "CVS", "ABT"],
  "Biotech / Drug Discovery": ["MRNA", "BNTX", "REGN", "VRTX", "ILMN", "CRSP", "EDIT", "NTLA"],
  "Energy & Resources": ["XOM", "CVX", "COP", "SLB", "EOG", "PXD", "OXY", "FANG", "BP", "SHEL"],
  "Clean Energy": ["ENPH", "SEDG", "NEE", "FSLR", "PLUG", "BE", "BLDP", "RUN"],
  "Dividend Income": ["SCHD", "VYM", "HDV", "NOBL", "O", "MAIN", "T", "VZ", "KO", "PEP", "JNJ", "MO", "PM"],
  "S&P 500 / Broad Market": ["VOO", "SPY", "IVV", "VTI", "ITOT", "SCHB"],
  "Nasdaq / Growth": ["QQQ", "QQQM", "VUG", "SCHG", "IWF", "TQQQ"],
  "Emerging Markets": ["VWO", "EEM", "INDA", "EWZ", "FXI", "MCHI"],
  "Real Estate / REITs": ["VNQ", "SCHH", "O", "AMT", "PLD", "WELL", "SPG", "EQR", "AVB"],
  "Consumer Staples": ["KO", "PEP", "PG", "CL", "GIS", "K", "COST", "WMT", "TGT"],
  "Consumer Discretionary": ["TSLA", "NKE", "MCD", "SBUX", "HD", "LOW", "TJX", "AMZN"],
  "Financial / Banks": ["JPM", "BAC", "WFC", "GS", "MS", "BRK.B", "BLK", "C", "USB", "PNC"],
  "Defense & Aerospace": ["LMT", "RTX", "NOC", "GD", "BA", "LHX", "HII"],
  "Industrials": ["HON", "GE", "MMM", "CAT", "DE", "UPS", "FDX", "EMR", "ROK"],
  "SaaS / Software": ["MSFT", "ADBE", "NOW", "INTU", "WDAY", "ZM", "TEAM", "OKTA", "ZS", "PANW", "CRWD", "FTNT"],
  "Crypto-Adjacent": ["COIN", "MSTR", "BITO", "SQ", "PYPL", "HOOD"],
  "Bonds / Fixed Income": ["BND", "AGG", "TLT", "IEF", "SHY", "TIPS", "HYG", "JNK", "LQD"],
  "Gold / Commodities": ["GLD", "IAU", "SLV", "PDBC", "GSG", "DJP", "GDX", "GDXJ"],
  "Small Cap / Value": ["VBR", "AVUV", "IWM", "IWN", "VIOV", "DFSVX"],
};

// Risk notes by theme
const THEME_RISK_NOTES: Record<string, string> = {
  "Cloud Infrastructure": "Concentrated cloud exposure means macro headwinds (rate rises, CapEx cuts) hit multiple positions simultaneously.",
  "AI / Semiconductors": "Chip cycle risk: AI demand downturns or export restrictions affect the entire basket.",
  "Consumer Internet": "Ad-revenue dependent — macro slowdowns compress multiples across this theme together.",
  "Payments & Fintech": "Rate sensitivity and fintech regulation changes ripple across all payment names.",
  "E-Commerce": "Logistics cost and consumer spending cycles affect all e-commerce names in tandem.",
  "Healthcare": "Policy risk (drug pricing, insurance reform) can move the whole healthcare basket.",
  "Biotech / Drug Discovery": "Binary trial results and FDA decisions create correlated tail risk.",
  "Energy & Resources": "Oil price, geopolitics, and OPEC decisions drive correlated moves.",
  "Clean Energy": "Policy-driven (IRA, subsidies) — legislative changes compress the whole theme.",
  "Dividend Income": "Rising-rate environments pressure high-yield instruments across the board.",
  "S&P 500 / Broad Market": "Broad market ETFs overlap heavily — you may be double-counting index exposure.",
  "Nasdaq / Growth": "Tech growth multiple compression hits all Nasdaq-heavy ETFs simultaneously.",
  "Emerging Markets": "EM ETFs share China/geopolitical risk and USD strength exposure.",
  "Real Estate / REITs": "Rate-sensitive: rising rates reduce REIT valuations across the board.",
  "Consumer Staples": "Defensive but concentrated in slow-growth names; inflation-pass-through risk.",
  "Consumer Discretionary": "Consumer spending slowdowns compress this theme together.",
  "Financial / Banks": "Credit cycle and interest rate changes move bank stocks in tandem.",
  "Defense & Aerospace": "Budget cycle and geopolitical risk are shared across all defense names.",
  "Industrials": "Economic cycle sensitivity — slowdowns hit this theme broadly.",
  "SaaS / Software": "Multiple compression from rate rises affects the entire SaaS cohort simultaneously.",
  "Crypto-Adjacent": "Crypto sentiment and regulation risk drives highly correlated drawdowns.",
  "Bonds / Fixed Income": "Duration risk: rate rises cause simultaneous losses across fixed-income positions.",
  "Gold / Commodities": "Dollar strength and inflation expectations drive correlated moves.",
  "Small Cap / Value": "Liquidity risk and economic sensitivity create correlated drawdowns.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct > 25) return "bg-red-500";
  if (pct >= 15) return "bg-amber-500";
  return "bg-emerald-500";
}

function barBg(pct: number): string {
  if (pct > 25) return "bg-red-500/20";
  if (pct >= 15) return "bg-amber-500/20";
  return "bg-emerald-500/20";
}

function badgeColor(pct: number): string {
  if (pct > 25) return "text-red-400";
  if (pct >= 15) return "text-amber-400";
  return "text-emerald-400";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConcentrationRiskPage() {
  const { formatAmount } = useCurrency();

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  const { data: prices = {} as PriceData, isLoading: pricesLoading } = useQuery<PriceData>({
    queryKey: ["/api/prices"],
    staleTime: 60000,
  });

  // Enrich holdings with market values
  const enriched = useMemo(() => {
    return holdings.map((h) => {
      const p = prices[h.ticker];
      const price = p?.price ?? h.avg_cost;
      const mktValue = price * h.shares;
      return { ...h, mktValue };
    });
  }, [holdings, prices]);

  const totalMktValue = useMemo(
    () => enriched.reduce((s, h) => s + h.mktValue, 0),
    [enriched]
  );

  // Build ticker → mktValue map
  const tickerValues = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of enriched) m[h.ticker] = h.mktValue;
    return m;
  }, [enriched]);

  const ownedTickers = useMemo(() => new Set(enriched.map((h) => h.ticker)), [enriched]);

  // Compute theme exposures
  const themeExposures = useMemo(() => {
    return Object.entries(THEME_MAP)
      .map(([theme, tickers]) => {
        const matched = tickers.filter((t) => ownedTickers.has(t));
        if (matched.length === 0) return null;
        const value = matched.reduce((s, t) => s + (tickerValues[t] ?? 0), 0);
        const pct = totalMktValue > 0 ? (value / totalMktValue) * 100 : 0;
        return { theme, tickers: matched, value, pct };
      })
      .filter(Boolean)
      .sort((a, b) => b!.pct - a!.pct) as {
        theme: string;
        tickers: string[];
        value: number;
        pct: number;
      }[];
  }, [ownedTickers, tickerValues, totalMktValue]);

  // Overlap matrix: tickers in multiple themes
  const overlapMatrix = useMemo(() => {
    const tickerThemes: Record<string, string[]> = {};
    for (const { theme, tickers } of themeExposures) {
      for (const t of tickers) {
        if (!tickerThemes[t]) tickerThemes[t] = [];
        tickerThemes[t].push(theme);
      }
    }
    return Object.entries(tickerThemes)
      .filter(([, themes]) => themes.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
  }, [themeExposures]);

  // Unclassified holdings
  const allThemeTickers = useMemo(() => {
    const s = new Set<string>();
    for (const tickers of Object.values(THEME_MAP)) {
      tickers.forEach((t) => s.add(t));
    }
    return s;
  }, []);

  const unclassified = useMemo(
    () => enriched.filter((h) => !allThemeTickers.has(h.ticker)),
    [enriched, allThemeTickers]
  );

  // Highest concentration
  const topTheme = themeExposures[0];

  const isLoading = holdingsLoading || pricesLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Layers className="w-5 h-5 text-orange-400" />
          Concentration Risk
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cross-theme exposure beyond sector labels
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : enriched.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No holdings found. Add holdings to see theme exposure.</p>
        </div>
      ) : (
        <>
          {/* Summary alert */}
          {topTheme && (
            <div
              className={`rounded-lg border px-4 py-2.5 flex items-center gap-2.5 ${
                topTheme.pct > 30
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-border bg-card"
              }`}
            >
              {topTheme.pct > 30 && (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <p className="text-xs text-foreground">
                Highest concentration:{" "}
                <span className={`font-semibold ${badgeColor(topTheme.pct)}`}>
                  {topTheme.theme}
                </span>{" "}
                —{" "}
                <span className={`font-mono font-semibold ${badgeColor(topTheme.pct)}`}>
                  {topTheme.pct.toFixed(1)}%
                </span>{" "}
                of portfolio
              </p>
            </div>
          )}

          {/* Theme cards */}
          <div className="space-y-2">
            {themeExposures.map(({ theme, tickers, value, pct }) => (
              <div
                key={theme}
                className="rounded-lg border border-border bg-card p-3.5"
                data-testid={`card-theme-${theme.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {/* Top row: name + pct + bar */}
                <div className="flex items-center justify-between mb-1.5 gap-3">
                  <span className="text-sm font-semibold text-foreground">{theme}</span>
                  <span className={`font-mono text-sm font-bold shrink-0 ${badgeColor(pct)}`}>
                    {pct.toFixed(1)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className={`h-1.5 w-full rounded-full mb-2 ${barBg(pct)}`}>
                  <div
                    className={`h-full rounded-full transition-all ${barColor(pct)}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>

                {/* Tickers row */}
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {tickers.map((t) => (
                    <span
                      key={t}
                      className="font-mono text-[10px] text-foreground/80 bg-muted px-1.5 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* Bottom row: value + risk note */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {formatAmount(value, true)} across {tickers.length} holding{tickers.length !== 1 ? "s" : ""}
                  </span>
                  {pct > 25 && (
                    <span className="text-[10px] text-amber-400/80 shrink-0">High risk</span>
                  )}
                </div>

                {/* Risk note */}
                {THEME_RISK_NOTES[theme] && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed border-t border-border/50 pt-1.5">
                    {THEME_RISK_NOTES[theme]}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Overlap matrix */}
          {overlapMatrix.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Multi-Theme Overlaps
              </h3>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Ticker
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Themes it touches
                      </th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        # Themes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {overlapMatrix.map(([ticker, themes], idx) => (
                      <tr
                        key={ticker}
                        className={idx % 2 === 0 ? "" : "bg-muted/30"}
                        data-testid={`row-overlap-${ticker}`}
                      >
                        <td className="px-3 py-2 font-mono font-semibold text-foreground">
                          {ticker}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          <div className="flex flex-wrap gap-1">
                            {themes.map((theme) => (
                              <span
                                key={theme}
                                className="inline-block bg-muted/60 rounded px-1.5 py-0.5 text-[10px]"
                              >
                                {theme}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-primary font-semibold">
                          {themes.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unclassified holdings */}
          {unclassified.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Unclassified ({unclassified.length})
              </h3>
              <div className="rounded-lg border border-border bg-card p-3 flex flex-wrap gap-2">
                {unclassified.map((h) => (
                  <span
                    key={h.ticker}
                    className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded"
                    title={`${h.ticker} — not matched to any theme`}
                  >
                    {h.ticker}
                  </span>
                ))}
                <p className="w-full text-[10px] text-muted-foreground mt-1">
                  These tickers are not in any theme map. They still count toward total portfolio value.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

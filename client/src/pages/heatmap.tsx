import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Holding } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/contexts/CurrencyContext";
import { fmtPct } from "@/components/format";
import type { PriceData } from "@/pages/dashboard";
import { LayoutGrid } from "lucide-react";

// ─── Sector config ────────────────────────────────────────────────────────────

const SECTORS = [
  { name: "Technology", weight: 31, key: "tech" },
  { name: "Healthcare", weight: 13, key: "healthcare" },
  { name: "Financials", weight: 13, key: "financials" },
  { name: "Consumer Disc.", weight: 10, key: "consumer_disc" },
  { name: "Industrials", weight: 9, key: "industrials" },
  { name: "Communication", weight: 8, key: "communication" },
  { name: "Consumer Staples", weight: 6, key: "staples" },
  { name: "Energy", weight: 4, key: "energy" },
  { name: "Real Estate", weight: 2, key: "real_estate" },
  { name: "Materials", weight: 2, key: "materials" },
  { name: "Utilities", weight: 2, key: "utilities" },
];

const TICKER_SECTOR: Record<string, string> = {
  // Tech
  AAPL: "tech", MSFT: "tech", NVDA: "tech", AMD: "tech", INTC: "tech",
  AVGO: "tech", QCOM: "tech", TSM: "tech", ASML: "tech", ARM: "tech",
  ADBE: "tech", NOW: "tech", INTU: "tech", WDAY: "tech", SNOW: "tech",
  DDOG: "tech", MDB: "tech", PANW: "tech", CRWD: "tech", ZS: "tech",
  FTNT: "tech", OKTA: "tech", ZM: "tech", TEAM: "tech", SMCI: "tech",
  ORCL: "tech", IBM: "tech", SAP: "tech", PLTR: "tech",
  VOO: "tech", SPY: "tech", QQQ: "tech", VTI: "tech", QQQM: "tech",
  // Communication
  META: "communication", GOOGL: "communication", GOOG: "communication",
  NFLX: "communication", DIS: "communication", CMCSA: "communication",
  T: "communication", VZ: "communication", SNAP: "communication", PINS: "communication",
  // Consumer Disc
  AMZN: "consumer_disc", TSLA: "consumer_disc", NKE: "consumer_disc",
  MCD: "consumer_disc", SBUX: "consumer_disc", HD: "consumer_disc",
  LOW: "consumer_disc", TJX: "consumer_disc", BKNG: "consumer_disc",
  ABNB: "consumer_disc", UBER: "consumer_disc", SHOP: "consumer_disc",
  // Consumer Staples
  KO: "staples", PEP: "staples", PG: "staples", CL: "staples",
  GIS: "staples", COST: "staples", WMT: "staples", TGT: "staples",
  MO: "staples", PM: "staples",
  // Healthcare
  UNH: "healthcare", JNJ: "healthcare", PFE: "healthcare", ABBV: "healthcare",
  MRK: "healthcare", LLY: "healthcare", BMY: "healthcare", AMGN: "healthcare",
  GILD: "healthcare", CVS: "healthcare", ABT: "healthcare", MRNA: "healthcare",
  BNTX: "healthcare", REGN: "healthcare", VRTX: "healthcare",
  // Financials
  JPM: "financials", BAC: "financials", WFC: "financials", GS: "financials",
  MS: "financials", "BRK.B": "financials", BLK: "financials", C: "financials",
  V: "financials", MA: "financials", PYPL: "financials", AXP: "financials",
  COIN: "financials", HOOD: "financials", SQ: "financials",
  // Industrials
  HON: "industrials", GE: "industrials", MMM: "industrials", CAT: "industrials",
  DE: "industrials", UPS: "industrials", FDX: "industrials",
  LMT: "industrials", RTX: "industrials", NOC: "industrials", BA: "industrials",
  // Energy
  XOM: "energy", CVX: "energy", COP: "energy", SLB: "energy",
  EOG: "energy", OXY: "energy", BP: "energy", SHEL: "energy",
  ENPH: "energy", FSLR: "energy",
  // Real Estate
  VNQ: "real_estate", O: "real_estate", AMT: "real_estate",
  PLD: "real_estate", WELL: "real_estate", SPG: "real_estate",
  // Materials
  NEM: "materials", FCX: "materials", LIN: "materials", APD: "materials",
  GLD: "materials", IAU: "materials", SLV: "materials",
  // Utilities
  NEE: "utilities", DUK: "utilities", SO: "utilities", D: "utilities",
  // Bonds / Other
  BND: "bonds", AGG: "bonds", TLT: "bonds", IEF: "bonds", HYG: "bonds",
  LQD: "bonds", JNK: "bonds", SHY: "bonds",
  // Dividends ETFs
  SCHD: "staples", VYM: "staples", HDV: "staples",
};

// ─── Color helpers ────────────────────────────────────────────────────────────

function dayChangeBg(pct: number, hasHoldings: boolean): string {
  if (!hasHoldings) return "bg-zinc-900/60";
  if (pct > 1) return "bg-emerald-500/80";
  if (pct > 0.1) return "bg-emerald-700/60";
  if (pct >= -0.1) return "bg-zinc-700/60";
  if (pct >= -1) return "bg-red-700/60";
  return "bg-red-500/80";
}

function dayChangeText(pct: number): string {
  if (pct > 1) return "text-emerald-300";
  if (pct > 0.1) return "text-emerald-400";
  if (pct >= -0.1) return "text-zinc-400";
  if (pct >= -1) return "text-red-400";
  return "text-red-300";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectorData {
  key: string;
  name: string;
  weight: number;
  tickers: string[];
  mktValue: number;
  portfolioWeight: number;
  avgDayPct: number;
  hasHoldings: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HeatmapPage() {
  const { formatAmount } = useCurrency();

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  const { data: prices = {} as PriceData, isLoading: pricesLoading } = useQuery<PriceData>({
    queryKey: ["/api/prices"],
    staleTime: 60000,
  });

  // Enrich holdings
  const enriched = useMemo(() => {
    return holdings.map((h) => {
      const p = prices[h.ticker];
      const price = p?.price ?? h.avg_cost;
      const mktValue = price * h.shares;
      const dayPct = p?.changesPercentage ?? p?.changePercentage ?? 0;
      const sector = TICKER_SECTOR[h.ticker] ?? "other";
      return { ...h, mktValue, dayPct, sector };
    });
  }, [holdings, prices]);

  const totalMktValue = useMemo(
    () => enriched.reduce((s, h) => s + h.mktValue, 0),
    [enriched]
  );

  // Build sector data
  const sectorData = useMemo((): SectorData[] => {
    return SECTORS.map(({ key, name, weight }) => {
      const inSector = enriched.filter((h) => h.sector === key);
      const mktValue = inSector.reduce((s, h) => s + h.mktValue, 0);
      const tickers = inSector.map((h) => h.ticker);
      const portfolioWeight = totalMktValue > 0 ? (mktValue / totalMktValue) * 100 : 0;
      const avgDayPct =
        inSector.length > 0
          ? inSector.reduce((s, h) => s + h.dayPct, 0) / inSector.length
          : 0;
      return {
        key,
        name,
        weight,
        tickers,
        mktValue,
        portfolioWeight,
        avgDayPct,
        hasHoldings: inSector.length > 0,
      };
    });
  }, [enriched, totalMktValue]);

  // Split into two rows
  const row1 = sectorData.slice(0, 6); // Tech, Healthcare, Financials, Consumer Disc, Industrials, Communication
  const row2 = sectorData.slice(6);    // Staples, Energy, Real Estate, Materials, Utilities

  const isLoading = holdingsLoading || pricesLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-blue-400" />
          Markets Heatmap
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Live sector heatmap — cell size = S&P 500 weight, color = today's performance. Your holdings are highlighted.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-52 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : (
        <>
          {/* ── Heatmap ── */}
          <div className="rounded-lg border border-border bg-card p-2 space-y-1.5 overflow-hidden">
            {/* Row 1 */}
            <div className="flex gap-1.5 h-52">
              {row1.map((sector) => (
                <SectorCell
                  key={sector.key}
                  sector={sector}
                  formatAmount={formatAmount}
                />
              ))}
            </div>
            {/* Row 2 */}
            <div className="flex gap-1.5 h-28">
              {row2.map((sector) => (
                <SectorCell
                  key={sector.key}
                  sector={sector}
                  formatAmount={formatAmount}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground px-1">
            <span className="font-medium text-foreground/70">Legend:</span>
            <LegendItem color="border-2 border-white/70 bg-transparent" label="Your holdings" />
            <LegendItem color="bg-emerald-500/80" label="> +1%" />
            <LegendItem color="bg-emerald-700/60" label="+0.1% to +1%" />
            <LegendItem color="bg-zinc-700/60" label="Flat" />
            <LegendItem color="bg-red-700/60" label="-0.1% to -1%" />
            <LegendItem color="bg-red-500/80" label="< -1%" />
            <LegendItem color="bg-zinc-900/60" label="No exposure" />
          </div>

          {/* Exposure table */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Your Exposure by Sector
            </h3>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sector</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Your Holdings</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Market Value</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Weight %</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Avg Day %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectorData
                      .filter((s) => s.hasHoldings)
                      .sort((a, b) => b.portfolioWeight - a.portfolioWeight)
                      .map((s, idx) => (
                        <tr
                          key={s.key}
                          className={idx % 2 === 0 ? "" : "bg-muted/20"}
                          data-testid={`row-sector-${s.key}`}
                        >
                          <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {s.tickers.map((t) => (
                                <span key={t} className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground/80">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-foreground">
                            {formatAmount(s.mktValue, true)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {s.portfolioWeight.toFixed(1)}%
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold ${dayChangeText(s.avgDayPct)}`}>
                            {fmtPct(s.avgDayPct)}
                          </td>
                        </tr>
                      ))}
                    {sectorData.filter((s) => s.hasHoldings).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          No holdings match sector classifications. Add holdings to see exposure.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Unclassified in sector terms */}
          {(() => {
            const unclassifiedSector = enriched.filter(
              (h) => !TICKER_SECTOR[h.ticker]
            );
            if (unclassifiedSector.length === 0) return null;
            return (
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <p className="text-[10px] text-muted-foreground">
                  <span className="font-semibold text-foreground/60">Not mapped to a sector:</span>{" "}
                  {unclassifiedSector.map((h) => h.ticker).join(", ")}
                </p>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ─── Sector Cell ──────────────────────────────────────────────────────────────

function SectorCell({
  sector,
  formatAmount,
}: {
  sector: SectorData;
  formatAmount: (n: number, compact?: boolean) => string;
}) {
  const bg = dayChangeBg(sector.avgDayPct, sector.hasHoldings);
  const txtColor = dayChangeText(sector.avgDayPct);

  return (
    <div
      className={`
        flex-shrink-0 rounded-md flex flex-col justify-between p-1.5 overflow-hidden relative transition-all
        ${bg}
        ${sector.hasHoldings ? "border-2 border-white/70 ring-1 ring-white/20" : "border border-border/30"}
      `}
      style={{ flexBasis: `${sector.weight}%`, minWidth: 0 }}
      data-testid={`cell-sector-${sector.key}`}
    >
      {/* Sector name */}
      <div>
        <div className="text-[9px] font-semibold text-white/80 leading-tight truncate">
          {sector.name}
        </div>
        <div className="text-[8px] text-white/50">{sector.weight}%</div>
      </div>

      {/* Tickers */}
      {sector.hasHoldings && (
        <div className="flex flex-wrap gap-0.5 my-1">
          {sector.tickers.slice(0, 6).map((t) => (
            <span
              key={t}
              className="font-mono text-[8px] bg-black/30 rounded px-0.5 text-white/90 leading-tight"
            >
              {t}
            </span>
          ))}
          {sector.tickers.length > 6 && (
            <span className="font-mono text-[8px] text-white/50">
              +{sector.tickers.length - 6}
            </span>
          )}
        </div>
      )}

      {/* Bottom row: value + day % */}
      <div className="flex items-end justify-between gap-1">
        {sector.hasHoldings && (
          <span className="text-[8px] font-mono text-white/60 truncate">
            {formatAmount(sector.mktValue, true)}
          </span>
        )}
        {sector.hasHoldings && (
          <span className={`text-[9px] font-mono font-bold shrink-0 ${txtColor}`}>
            {fmtPct(sector.avgDayPct)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Legend item ──────────────────────────────────────────────────────────────

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-3 h-3 rounded-sm ${color}`} />
      <span>{label}</span>
    </div>
  );
}

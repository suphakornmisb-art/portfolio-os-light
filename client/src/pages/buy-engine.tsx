import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Bot, ChevronDown, ChevronUp, AlertTriangle, ExternalLink } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Holding, Enrichment } from "@shared/schema";

interface FairValueItem {
  ticker: string;
  valuation_label: string;
}

interface BuyScore {
  total: number;
  valScore: number;
  qualScore: number;
  growthScore: number;
  safetyScore: number;
  label: string;
  color: string;
}

function scoreHolding(
  holding: Holding,
  enrichment: Enrichment | undefined,
  fairValueLabel: string | undefined
): BuyScore {
  // Valuation score (0-25 pts)
  let valScore = 0;
  if (fairValueLabel === "Undervalued") valScore = 25;
  else if (fairValueLabel === "Fair Value") valScore = 15;
  else if (fairValueLabel === "Slight Discount") valScore = 20;
  else if (fairValueLabel === "Slight Premium") valScore = 8;
  else if (fairValueLabel === "Overvalued") valScore = 0;
  // Map the actual fair-value labels used in the app
  else if (fairValueLabel === "Deep Discount") valScore = 25;
  else if (fairValueLabel === "Discount") valScore = 20;
  else if (fairValueLabel === "Fair Range") valScore = 15;
  else if (fairValueLabel === "Premium") valScore = 8;
  else if (fairValueLabel === "Rich") valScore = 0;
  else valScore = 10; // unknown / not enriched

  // Quality score (0-25 pts) — based on ROIC and FCF margin
  let qualScore = 0;
  if ((enrichment?.roic ?? 0) > 20) qualScore += 15;
  else if ((enrichment?.roic ?? 0) > 10) qualScore += 8;
  if ((enrichment?.fcf_margin ?? 0) > 15) qualScore += 10;
  else if ((enrichment?.fcf_margin ?? 0) > 5) qualScore += 5;

  // Growth score (0-25 pts)
  let growthScore = 0;
  if ((enrichment?.revenue_growth_5y ?? 0) > 20) growthScore = 25;
  else if ((enrichment?.revenue_growth_5y ?? 0) > 10) growthScore = 18;
  else if ((enrichment?.revenue_growth_5y ?? 0) > 5) growthScore = 10;
  else growthScore = 5;

  // Safety score (0-25 pts) — low debt, low beta
  let safetyScore = 0;
  const debtRatio = enrichment?.net_debt_ebitda ?? 0;
  if (debtRatio < 1) safetyScore += 15;
  else if (debtRatio < 3) safetyScore += 8;
  const beta = enrichment?.beta ?? 1.0;
  if (beta < 0.8) safetyScore += 10;
  else if (beta < 1.2) safetyScore += 6;
  else safetyScore += 2;

  const total = valScore + qualScore + growthScore + safetyScore;

  // Label
  let label: string;
  let color: string;
  if (total >= 80) {
    label = "Strong Buy";
    color = "emerald";
  } else if (total >= 65) {
    label = "Buy";
    color = "green";
  } else if (total >= 50) {
    label = "Hold";
    color = "amber";
  } else if (total >= 35) {
    label = "Review";
    color = "orange";
  } else {
    label = "Reduce";
    color = "red";
  }

  return { total, valScore, qualScore, growthScore, safetyScore, label, color };
}

const SIGNAL_COLORS: Record<string, string> = {
  "Strong Buy": "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  Buy: "text-green-400 border-green-500/30 bg-green-500/10",
  Hold: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  Review: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  Reduce: "text-red-400 border-red-500/30 bg-red-500/10",
};

const SIGNAL_DOT: Record<string, string> = {
  "Strong Buy": "bg-emerald-400",
  Buy: "bg-green-400",
  Hold: "bg-amber-400",
  Review: "bg-orange-400",
  Reduce: "bg-red-400",
};

type FilterLabel = "All" | "Strong Buy" | "Buy" | "Hold" | "Review" | "Reduce";

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 65
      ? "bg-green-500"
      : pct >= 50
      ? "bg-amber-500"
      : pct >= 35
      ? "bg-orange-500"
      : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs font-semibold text-foreground w-8 text-right">
        {value}
      </span>
    </div>
  );
}

function SubBar({ value, max = 25, label }: { value: number; max?: number; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/70 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground w-8 text-right">
        {value}/25
      </span>
    </div>
  );
}

function HoldingRow({
  holding,
  enrichment,
  fvLabel,
}: {
  holding: Holding;
  enrichment: Enrichment | undefined;
  fvLabel: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const { formatAmount } = useCurrency();
  const score = useMemo(
    () => scoreHolding(holding, enrichment, fvLabel),
    [holding, enrichment, fvLabel]
  );

  return (
    <div
      className="border-b border-border/50 last:border-0"
      data-testid={`row-be-${holding.ticker}`}
    >
      {/* Main row */}
      <div
        className="grid grid-cols-[70px_80px_1fr_60px_60px_60px_60px_100px] items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        data-testid={`row-be-expand-${holding.ticker}`}
      >
        <span className="font-mono font-bold text-sm text-foreground">{holding.ticker}</span>
        <span className="text-[10px] uppercase text-muted-foreground">{holding.bdd_type}</span>
        <ScoreBar value={score.total} />
        <span className="text-right font-mono text-xs text-muted-foreground">{score.valScore}</span>
        <span className="text-right font-mono text-xs text-muted-foreground">{score.qualScore}</span>
        <span className="text-right font-mono text-xs text-muted-foreground">{score.growthScore}</span>
        <span className="text-right font-mono text-xs text-muted-foreground">{score.safetyScore}</span>
        <div className="flex items-center justify-end gap-1">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${SIGNAL_DOT[score.label] ?? "bg-zinc-400"}`} />
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 h-4 ${SIGNAL_COLORS[score.label] ?? ""}`}
              data-testid={`badge-be-signal-${holding.ticker}`}
            >
              {score.label}
            </Badge>
          </div>
          {expanded ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 bg-muted/10 border-t border-border/40">
          {/* Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                Score Breakdown
              </p>
              <SubBar value={score.valScore} label="Valuation" />
              <SubBar value={score.qualScore} label="Quality" />
              <SubBar value={score.growthScore} label="Growth" />
              <SubBar value={score.safetyScore} label="Safety" />
            </div>

            {/* Metrics */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                Enrichment Metrics
              </p>
              {enrichment ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div className="text-muted-foreground">
                    ROIC:{" "}
                    <span className="text-foreground font-mono">
                      {enrichment.roic != null ? `${enrichment.roic.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    FCF Margin:{" "}
                    <span className="text-foreground font-mono">
                      {enrichment.fcf_margin != null ? `${enrichment.fcf_margin.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Rev. Growth 5y:{" "}
                    <span className="text-foreground font-mono">
                      {enrichment.revenue_growth_5y != null
                        ? `${enrichment.revenue_growth_5y.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Beta:{" "}
                    <span className="text-foreground font-mono">
                      {enrichment.beta != null ? enrichment.beta.toFixed(2) : "—"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Net Debt/EBITDA:{" "}
                    <span className="text-foreground font-mono">
                      {enrichment.net_debt_ebitda != null
                        ? enrichment.net_debt_ebitda.toFixed(2)
                        : "—"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Valuation:{" "}
                    <span className="text-foreground font-mono">{fvLabel ?? "—"}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  No enrichment data.{" "}
                  <span className="text-primary">
                    Enrich this holding from the Fair Value tab to improve accuracy.
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Explanation */}
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <p>
              <span className="text-foreground font-medium">Valuation {score.valScore}/25</span>
              {" — "}
              {fvLabel ?? "Not enriched"}.
            </p>
            <p>
              <span className="text-foreground font-medium">Quality {score.qualScore}/25</span>
              {" — "}
              ROIC {enrichment?.roic != null ? `${enrichment.roic.toFixed(1)}%` : "N/A"}, FCF Margin{" "}
              {enrichment?.fcf_margin != null ? `${enrichment.fcf_margin.toFixed(1)}%` : "N/A"}.
            </p>
            <p>
              <span className="text-foreground font-medium">Growth {score.growthScore}/25</span>
              {" — "}
              Revenue CAGR 5y:{" "}
              {enrichment?.revenue_growth_5y != null
                ? `${enrichment.revenue_growth_5y.toFixed(1)}%`
                : "N/A"}.
            </p>
            <p>
              <span className="text-foreground font-medium">Safety {score.safetyScore}/25</span>
              {" — "}
              Beta {enrichment?.beta != null ? enrichment.beta.toFixed(2) : "N/A"}, Net Debt/EBITDA{" "}
              {enrichment?.net_debt_ebitda != null ? enrichment.net_debt_ebitda.toFixed(2) : "N/A"}.
            </p>
          </div>

          {holding.notes && (
            <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
              <span className="text-foreground font-medium">Thesis notes: </span>
              {holding.notes}
            </p>
          )}

          {!enrichment && (
            <p className="text-[11px] text-amber-400/80">
              This score is based on default values. Enrich holdings from the Fair Value tab to
              improve accuracy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const FILTER_OPTIONS: FilterLabel[] = ["All", "Strong Buy", "Buy", "Hold", "Review", "Reduce"];

export default function BuyEnginePage() {
  const [filter, setFilter] = useState<FilterLabel>("All");

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  const { data: enrichments = [] } = useQuery<Enrichment[]>({
    queryKey: ["/api/enrichments"],
  });

  const { data: fairValues = [] } = useQuery<FairValueItem[]>({
    queryKey: ["/api/fair-value"],
  });

  const enrichMap = useMemo(() => {
    const m: Record<string, Enrichment> = {};
    for (const e of enrichments) m[e.ticker] = e;
    return m;
  }, [enrichments]);

  const fvMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of fairValues) m[f.ticker] = f.valuation_label;
    return m;
  }, [fairValues]);

  // Score all holdings
  const scoredHoldings = useMemo(() => {
    return holdings
      .map((h) => ({
        holding: h,
        enrichment: enrichMap[h.ticker],
        fvLabel: fvMap[h.ticker],
        score: scoreHolding(h, enrichMap[h.ticker], fvMap[h.ticker]),
      }))
      .sort((a, b) => b.score.total - a.score.total);
  }, [holdings, enrichMap, fvMap]);

  const filtered = useMemo(() => {
    if (filter === "All") return scoredHoldings;
    return scoredHoldings.filter((s) => s.score.label === filter);
  }, [scoredHoldings, filter]);

  // Count per label for filter badges
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of scoredHoldings) {
      c[s.score.label] = (c[s.score.label] ?? 0) + 1;
    }
    return c;
  }, [scoredHoldings]);

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          Buy Decision Engine
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Deterministic scoring — no AI, no advice. Just your data.
        </p>
      </div>

      {/* Disclaimer banner */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="text-amber-400 font-medium">Disclaimer: </span>
          Buy Decision Engine scores reflect quantitative metrics only. They do not account for
          qualitative factors, recent news, or thesis validity. This is not financial advice.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 flex-wrap border-b border-border pb-1">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              filter === f
                ? "bg-primary/20 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-be-${f.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {f}
            {f !== "All" && counts[f] != null && (
              <span className="ml-1.5 text-[10px] opacity-70">({counts[f]})</span>
            )}
            {f === "All" && (
              <span className="ml-1.5 text-[10px] opacity-70">({scoredHoldings.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {holdingsLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Bot className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {holdings.length === 0
              ? "No holdings yet — add holdings to see scores"
              : `No holdings with signal: ${filter}`}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[70px_80px_1fr_60px_60px_60px_60px_100px] gap-2 px-3 py-2 border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider font-medium bg-muted/30">
            <span>Ticker</span>
            <span>BDD Type</span>
            <span>Score</span>
            <span className="text-right">Val</span>
            <span className="text-right">Qual</span>
            <span className="text-right">Growth</span>
            <span className="text-right">Safety</span>
            <span className="text-right">Signal</span>
          </div>

          <div>
            {filtered.map(({ holding, enrichment, fvLabel }) => (
              <HoldingRow
                key={holding.ticker}
                holding={holding}
                enrichment={enrichment}
                fvLabel={fvLabel}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scoring legend */}
      <div className="rounded-lg border border-border bg-card/50 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Scoring System (out of 100)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <div>
            <p className="font-medium text-foreground mb-1">Valuation (25 pts)</p>
            <p className="text-muted-foreground">Based on Fair Value label from deterministic model</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Quality (25 pts)</p>
            <p className="text-muted-foreground">ROIC and FCF margin from enrichment data</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Growth (25 pts)</p>
            <p className="text-muted-foreground">5-year revenue CAGR from enrichment data</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Safety (25 pts)</p>
            <p className="text-muted-foreground">Beta and Net Debt/EBITDA — low leverage, low volatility</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {(["Strong Buy ≥80", "Buy ≥65", "Hold ≥50", "Review ≥35", "Reduce <35"] as const).map(
            (lbl) => {
              const signal = lbl.split(" ")[0] + (lbl.includes("Strong") ? " Buy" : "");
              const key = lbl.includes("Strong Buy") ? "Strong Buy" : lbl.split(" ")[0];
              return (
                <span
                  key={lbl}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${SIGNAL_COLORS[key] ?? ""}`}
                >
                  {lbl}
                </span>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}

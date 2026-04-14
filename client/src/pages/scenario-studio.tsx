import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FlaskConical,
  AlertTriangle,
  BookOpen,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import type { Scenario, ScenarioType, SeverityLevel } from "@shared/scenarios";
import { SCENARIO_LIBRARY } from "@shared/scenarios";

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScenarioRunResult {
  scenario_id: string;
  severity: SeverityLevel;
  portfolio_value_before: number;
  portfolio_value_after: number;
  total_impact: number;
  total_impact_pct: number;
  income_change?: number;
  income_change_pct?: number;
  top_contributors: Array<{
    ticker: string;
    bdd_type: string;
    beta: number;
    shock_applied: number;
    impact: number;
  }>;
  sleeve_impacts: Array<{
    sleeve: string;
    impact_pct: number;
    impact_amount: number;
  }>;
  watch_list: string[];
  confidence: "high" | "medium";
  source_date: string;
}

// ─── Badge helpers ─────────────────────────────────────────────────────────────

function typeLabel(type: ScenarioType): string {
  switch (type) {
    case "macro_path": return "Macro Path";
    case "factor_shock": return "Factor Shock";
    case "historical_template": return "Historical";
    case "portfolio_specific": return "Portfolio-Specific";
  }
}

function typeBadgeClass(type: ScenarioType): string {
  switch (type) {
    case "macro_path": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "factor_shock": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "historical_template": return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "portfolio_specific": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  }
}

function confidenceDot(confidence: "high" | "medium") {
  return confidence === "high" ? "bg-emerald-500" : "bg-amber-400";
}

// ─── Scenario Card ─────────────────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  onRun,
}: {
  scenario: Scenario;
  onRun: (s: Scenario) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 hover:border-border/80 transition-all"
      data-testid={`card-scenario-${scenario.id}`}
    >
      {/* Top row: name + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground leading-snug">{scenario.name}</span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${typeBadgeClass(scenario.type)}`}
          >
            {typeLabel(scenario.type)}
          </span>
          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground border border-border">
            W{scenario.wave}
          </span>
        </div>
        {/* Confidence dot */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <span className={`w-2 h-2 rounded-full ${confidenceDot(scenario.confidence)}`} />
          <span className="text-[10px] text-muted-foreground capitalize">{scenario.confidence}</span>
        </div>
      </div>

      {/* Tagline */}
      <p className="text-xs text-muted-foreground leading-snug line-clamp-1">{scenario.tagline}</p>

      {/* Source */}
      <p className="text-[10px] text-muted-foreground/60 leading-snug">
        Source: {scenario.source}
      </p>

      {/* Education note expand */}
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <BookOpen className="w-3 h-3" />
          Learn more
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {expanded && (
          <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-2">
            {scenario.education_note}
          </p>
        )}
      </div>

      {/* Run button */}
      <Button
        variant="outline"
        size="sm"
        className="mt-auto border-primary/40 text-primary hover:bg-primary/10 hover:border-primary text-xs h-8"
        onClick={() => onRun(scenario)}
        data-testid={`button-run-${scenario.id}`}
      >
        <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
        Run Scenario
      </Button>
    </div>
  );
}

// ─── Results Panel ─────────────────────────────────────────────────────────────

function ResultsPanel({ result }: { result: ScenarioRunResult }) {
  const impactAbs = result.total_impact;
  const impactPct = result.total_impact_pct;
  const isLoss = impactAbs < 0;

  // Sleeve bar chart max for relative scaling
  const maxAbsSleeveImpact = result.sleeve_impacts.length
    ? Math.max(...result.sleeve_impacts.map((s) => Math.abs(s.impact_amount)))
    : 1;

  return (
    <div className="space-y-4 mt-4">
      {/* Big impact number */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Portfolio Impact
            </p>
            <p className={`text-2xl font-mono font-bold ${isLoss ? "text-red-400" : "text-emerald-400"}`}>
              {fmt(impactAbs)}
            </p>
            <p className={`text-sm font-mono ${isLoss ? "text-red-400/80" : "text-emerald-400/80"}`}>
              {fmtPct(impactPct)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Stressed Value
            </p>
            <p className="text-lg font-mono font-semibold text-foreground">
              {fmt(result.portfolio_value_after)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              was {fmt(result.portfolio_value_before)}
            </p>
          </div>
        </div>

        {/* 3 metric pills */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
          <div className="px-2.5 py-1.5 rounded-md bg-muted/60 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total Impact</p>
            <p className={`text-xs font-mono font-semibold ${isLoss ? "text-red-400" : "text-emerald-400"}`}>
              {fmt(impactAbs)}
            </p>
          </div>
          {result.income_change != null && (
            <div className="px-2.5 py-1.5 rounded-md bg-muted/60 text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Income Change</p>
              <p className={`text-xs font-mono font-semibold ${(result.income_change ?? 0) < 0 ? "text-red-400" : "text-emerald-400"}`}>
                {result.income_change_pct != null ? fmtPct(result.income_change_pct) : "—"}
              </p>
            </div>
          )}
          <div className="px-2.5 py-1.5 rounded-md bg-muted/60 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Severity</p>
            <p className="text-xs font-mono font-semibold text-foreground capitalize">
              {result.severity}
            </p>
          </div>
        </div>
      </div>

      {/* Top 5 risk contributors */}
      {result.top_contributors.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5" />
            Top 5 Risk Contributors
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 text-[10px] text-muted-foreground font-medium pr-3">Ticker</th>
                  <th className="text-left py-1.5 text-[10px] text-muted-foreground font-medium pr-3">BDD Type</th>
                  <th className="text-right py-1.5 text-[10px] text-muted-foreground font-medium pr-3">Beta</th>
                  <th className="text-right py-1.5 text-[10px] text-muted-foreground font-medium pr-3">Shock</th>
                  <th className="text-right py-1.5 text-[10px] text-muted-foreground font-medium">Impact</th>
                </tr>
              </thead>
              <tbody>
                {result.top_contributors.map((c, i) => (
                  <tr key={c.ticker} className={i < result.top_contributors.length - 1 ? "border-b border-border/40" : ""}>
                    <td className="py-1.5 font-mono font-bold text-foreground pr-3">{c.ticker}</td>
                    <td className="py-1.5 text-muted-foreground pr-3 whitespace-nowrap">{c.bdd_type}</td>
                    <td className="py-1.5 font-mono text-right pr-3 text-muted-foreground">{c.beta.toFixed(2)}</td>
                    <td className="py-1.5 font-mono text-right pr-3 text-amber-400">{fmtPct(c.shock_applied * 100)}</td>
                    <td className={`py-1.5 font-mono font-semibold text-right ${c.impact < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {fmt(c.impact)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BDD Sleeve Impact */}
      {result.sleeve_impacts.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            BDD Sleeve Impact
          </h3>
          <div className="space-y-2.5">
            {result.sleeve_impacts.map((s) => {
              const barWidth =
                maxAbsSleeveImpact > 0
                  ? Math.round((Math.abs(s.impact_amount) / maxAbsSleeveImpact) * 100)
                  : 0;
              const isNeg = s.impact_amount < 0;
              return (
                <div key={s.sleeve}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-muted-foreground">{s.sleeve}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-mono ${isNeg ? "text-red-400" : "text-emerald-400"}`}>
                        {fmtPct(s.impact_pct)}
                      </span>
                      <span className={`text-[11px] font-mono font-semibold ${isNeg ? "text-red-400" : "text-emerald-400"}`}>
                        {fmt(s.impact_amount)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isNeg ? "bg-red-500/60" : "bg-emerald-500/60"}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Income impact */}
      {result.income_change != null && result.income_change !== 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Annual Div income affected:{" "}
              <span className="font-mono font-semibold">
                {result.income_change_pct != null ? fmtPct(result.income_change_pct) : fmt(result.income_change)}
              </span>{" "}
              change
            </span>
          </p>
        </div>
      )}

      {/* What to Watch */}
      {result.watch_list.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            What to Watch
          </h3>
          <ul className="space-y-1">
            {result.watch_list.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="text-primary mt-0.5">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Source footnote */}
      <p className="text-[10px] text-muted-foreground/60 pb-2">
        Confidence:{" "}
        <span className={result.confidence === "high" ? "text-emerald-400" : "text-amber-400"}>
          {result.confidence}
        </span>{" "}
        · Data freshness: {result.source_date}
      </p>
    </div>
  );
}

// ─── Sheet Panel ────────────────────────────────────────────────────────────────

function ScenarioSheet({
  scenario,
  open,
  onClose,
}: {
  scenario: Scenario | null;
  open: boolean;
  onClose: () => void;
}) {
  const [severity, setSeverity] = useState<SeverityLevel>("medium");
  const [result, setResult] = useState<ScenarioRunResult | null>(null);

  const runMutation = useMutation({
    mutationFn: async (body: { scenario_id: string; severity: SeverityLevel }) => {
      const res = await apiRequest("POST", "/api/scenarios/run", body);
      return res.json() as Promise<ScenarioRunResult>;
    },
    onSuccess: (data) => {
      setResult(data);
    },
  });

  // Reset state when scenario changes
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      onClose();
      setResult(null);
      setSeverity("medium");
      runMutation.reset();
    }
  };

  if (!scenario) return null;

  const SEVERITIES: SeverityLevel[] = ["low", "medium", "high"];

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[540px] overflow-y-auto bg-background border-border"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-base text-foreground">
            <FlaskConical className="w-4 h-4 text-primary shrink-0" />
            {scenario.name}
          </SheetTitle>
        </SheetHeader>

        {/* Config panel */}
        <div className="space-y-4">
          {/* Narrative */}
          <p className="text-xs text-muted-foreground leading-relaxed">{scenario.narrative}</p>

          {/* Severity knob */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Severity
            </p>
            <div className="flex gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  data-testid={`button-severity-${s}`}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md border capitalize transition-all ${
                    severity === s
                      ? s === "low"
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                        : s === "medium"
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                        : "bg-red-500/20 border-red-500/50 text-red-400"
                      : "bg-muted/40 border-border text-muted-foreground hover:border-border/80"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Education callout */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex gap-2.5">
            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
                What this teaches
              </p>
              <p className="text-xs text-amber-300/90 leading-relaxed">{scenario.education_note}</p>
            </div>
          </div>

          {/* Source */}
          <p className="text-[10px] text-muted-foreground/70">
            Source: {scenario.source} · {scenario.source_date} · Horizon: {scenario.horizon_label}
          </p>

          {/* Run button */}
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9"
            onClick={() => runMutation.mutate({ scenario_id: scenario.id, severity })}
            disabled={runMutation.isPending}
            data-testid="button-run-stress-test"
          >
            {runMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Running…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5" />
                Run Stress Test
              </span>
            )}
          </Button>
        </div>

        {/* Results */}
        {runMutation.isPending && (
          <div className="space-y-3 mt-4">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
        )}

        {runMutation.isError && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Failed to run scenario. Please check your portfolio has holdings.
            </p>
          </div>
        )}

        {!runMutation.isPending && result && <ResultsPanel result={result} />}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Wave = 1 | 2 | 3;

export default function ScenarioStudioPage() {
  const [wave, setWave] = useState<Wave>(1);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filter scenarios by wave (using local data — no network call needed for library)
  const scenarios = SCENARIO_LIBRARY.filter((s) => s.wave === wave);

  const handleRun = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            Scenario Studio
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stress-test your portfolio against 26 regulatory &amp; historical scenarios
          </p>
        </div>

        {/* Wave filter tabs */}
        <div className="flex items-center gap-1">
          {([1, 2, 3] as Wave[]).map((w) => (
            <button
              key={w}
              onClick={() => setWave(w)}
              data-testid={`button-wave-${w}`}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                wave === w
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              Wave {w}
              <span className="ml-1.5 text-[10px] opacity-70">
                ({SCENARIO_LIBRARY.filter((s) => s.wave === w).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Wave description */}
      <div className="rounded-lg border border-border bg-card/50 px-4 py-2.5">
        <p className="text-xs text-muted-foreground">
          {wave === 1 && (
            <>
              <span className="text-foreground font-medium">Wave 1 — Must-Have:</span> Core regulatory scenarios (Fed, BoE, EBA) and essential factor shocks. Start here.
            </>
          )}
          {wave === 2 && (
            <>
              <span className="text-foreground font-medium">Wave 2 — Expansion:</span> Historical templates (GFC, COVID, 1998) and MSCI inflation regime scenarios.
            </>
          )}
          {wave === 3 && (
            <>
              <span className="text-foreground font-medium">Wave 3 — Advanced:</span> Tail-risk scenarios and portfolio-specific stress tests for the moonshot &amp; DCA sleeves.
            </>
          )}
        </p>
      </div>

      {/* Scenario grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {scenarios.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} onRun={handleRun} />
        ))}
      </div>

      {/* Sheet */}
      <ScenarioSheet
        scenario={selectedScenario}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

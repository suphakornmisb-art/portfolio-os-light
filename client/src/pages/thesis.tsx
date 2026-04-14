import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BDD_COLORS, bddLabel } from "@/components/format";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Trash2,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
  Plus,
  Download,
} from "lucide-react";
import type { Holding, Enrichment, Thesis, DevilsAdvocate } from "@shared/schema";
import type { WmbtItem } from "@shared/schema";

type PriceData = Record<string, { price?: number; [key: string]: any }>;

function safeParse(json: string): any[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

const BDD_BORDER_COLORS: Record<string, string> = {
  engine: "border-l-blue-500",
  grounder: "border-l-emerald-500",
  builder: "border-l-amber-500",
  moonshot: "border-l-purple-500",
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    strong_bear: { label: "Strong Bear", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
    moderate_bear: { label: "Moderate Bear", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    minor_concerns: { label: "Minor Concerns", cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
  };
  const v = map[verdict] || map.minor_concerns;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${v.cls}`}>
      {v.label}
    </span>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const cls =
    severity === "high"
      ? "bg-red-400"
      : severity === "medium"
      ? "bg-amber-400"
      : "bg-zinc-500";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls} mr-2 mt-1.5 flex-shrink-0`} />;
}

// ─── WMBT Status icon ─────────────────────────────────────────────────────────

function WmbtStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "verified":   return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
    case "at_risk":    return <AlertCircle   className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
    case "broken":     return <XCircle       className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
    default:           return <HelpCircle    className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />;
  }
}

const WMBT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "verified",   label: "Verified" },
  { value: "at_risk",    label: "At Risk" },
  { value: "broken",     label: "Broken" },
  { value: "unverified", label: "Unverified" },
];

// ─── WMBT Tracker Section ─────────────────────────────────────────────────────

function WmbtTracker({
  ticker,
  thesisItems,
}: {
  ticker: string;
  thesisItems: string[];
}) {
  const { toast } = useToast();
  const [newItem, setNewItem] = useState("");

  const { data: wmbtItems = [], isLoading } = useQuery<WmbtItem[]>({
    queryKey: [`/api/wmbt/${ticker}`],
  });

  const addMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest("POST", `/api/wmbt/${ticker}`, { text, status: "unverified" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/wmbt/${ticker}`] });
      setNewItem("");
    },
    onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/wmbt/${ticker}/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/wmbt/${ticker}`] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/wmbt/${ticker}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/wmbt/${ticker}`] }),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      for (const text of thesisItems) {
        if (!wmbtItems.some((w) => w.text === text)) {
          await apiRequest("POST", `/api/wmbt/${ticker}`, { text, status: "unverified" });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/wmbt/${ticker}`] });
      toast({ title: "Imported from thesis" });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const handleAdd = () => {
    const t = newItem.trim();
    if (t) addMutation.mutate(t);
  };

  const handleImport = () => importMutation.mutate();

  // Status counts
  const counts = { verified: 0, at_risk: 0, broken: 0, unverified: 0 };
  for (const w of wmbtItems) counts[w.status as keyof typeof counts] = (counts[w.status as keyof typeof counts] || 0) + 1;

  return (
    <div className="border-t border-border/50 pt-3 space-y-2">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            WMBT Tracker
          </h4>
          <div className="flex items-center gap-1">
            {counts.verified > 0   && <span className="text-[10px] font-mono text-emerald-400">{counts.verified}✓</span>}
            {counts.at_risk > 0    && <span className="text-[10px] font-mono text-amber-400">{counts.at_risk}!</span>}
            {counts.broken > 0     && <span className="text-[10px] font-mono text-red-400">{counts.broken}✗</span>}
            {counts.unverified > 0 && <span className="text-[10px] font-mono text-zinc-500">{counts.unverified}?</span>}
          </div>
        </div>
        {thesisItems.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleImport}
            disabled={importMutation.isPending}
            className="h-6 px-2 text-[10px] text-muted-foreground gap-1"
          >
            <Download className="w-2.5 h-2.5" />
            Import from thesis
          </Button>
        )}
      </div>

      {/* Items list */}
      {isLoading ? (
        <div className="space-y-1">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-6 rounded" />)}
        </div>
      ) : wmbtItems.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          No items yet. Add conditions that must be true to hold this position.
        </p>
      ) : (
        <ul className="space-y-1">
          {wmbtItems.map((item) => (
            <li key={item.id} className="flex items-start gap-2 group">
              <div className="pt-0.5">
                <WmbtStatusIcon status={item.status} />
              </div>
              <span className="flex-1 text-xs text-foreground/80 leading-relaxed">{item.text}</span>
              {/* Status selector */}
              <select
                value={item.status}
                onChange={(e) => patchMutation.mutate({ id: item.id, status: e.target.value })}
                className="h-5 text-[10px] bg-muted border border-border rounded px-1 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {WMBT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={() => deleteMutation.mutate(item.id)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 text-muted-foreground"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add new item */}
      <div className="flex items-center gap-1.5 pt-1">
        <Input
          placeholder="Add condition..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="h-7 text-xs bg-muted/50 border-transparent flex-1"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!newItem.trim() || addMutation.isPending}
          className="h-7 px-2 text-xs gap-1"
        >
          <Plus className="w-3 h-3" />
          Add
        </Button>
      </div>
    </div>
  );
}

// ─── Holding Card ─────────────────────────────────────────────────────────────

interface HoldingCardProps {
  holding: Holding;
  enrichment?: Enrichment;
  thesis?: Thesis;
  da?: DevilsAdvocate;
  mktValue: number;
  weight: number;
  onGenerateThesis: (ticker: string) => void;
  onDeleteThesis: (ticker: string) => void;
  onGenerateDA: (ticker: string) => void;
  generatingThesis: string | null;
  generatingDA: string | null;
}

function HoldingCard({
  holding,
  enrichment,
  thesis,
  da,
  mktValue,
  weight,
  onGenerateThesis,
  onDeleteThesis,
  onGenerateDA,
  generatingThesis,
  generatingDA,
}: HoldingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { formatAmount } = useCurrency();
  const colors = BDD_COLORS[holding.bdd_type] || BDD_COLORS.engine;
  const borderColor = BDD_BORDER_COLORS[holding.bdd_type] || "border-l-zinc-500";
  const isGeneratingThesis = generatingThesis === holding.ticker;
  const isGeneratingDA = generatingDA === holding.ticker;

  // Parse "What Must Be True" items from thesis for import feature
  const wmbtItems = thesis ? safeParse(thesis.what_must_be_true).filter((s: any) => typeof s === "string") : [];

  return (
    <div
      className={`rounded-lg border border-border bg-card border-l-[3px] ${borderColor} overflow-hidden`}
      data-testid={`card-thesis-${holding.ticker}`}
    >
      {/* Card Header */}
      <div
        className="px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => thesis && setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {thesis && (
              expanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )
            )}
            <span className="font-mono font-bold text-sm" data-testid={`text-ticker-${holding.ticker}`}>
              {holding.ticker}
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
              {bddLabel(holding.bdd_type)}
            </span>
            {da && (
              <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                Has DA
              </span>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-mono text-sm font-semibold">{formatAmount(mktValue, true)}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{weight.toFixed(1)}%</div>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground truncate">
            {enrichment?.company_name || ""} · {holding.sector}
          </span>
        </div>

        {/* Thesis summary preview */}
        {thesis && !expanded && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {thesis.summary}
          </p>
        )}

        {/* Loading state */}
        {isGeneratingThesis && (
          <div className="mt-2 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <p className="text-[11px] text-primary animate-pulse mt-1">Generating thesis...</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!expanded && !isGeneratingThesis && (
        <div className="px-4 pb-3 flex items-center gap-2">
          {!thesis ? (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onGenerateThesis(holding.ticker); }}
              className="h-7 text-xs"
              data-testid={`button-generate-thesis-${holding.ticker}`}
            >
              <Sparkles className="w-3 h-3 mr-1" />
              Generate Thesis
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onGenerateThesis(holding.ticker); }}
                className="h-7 text-xs text-muted-foreground"
                data-testid={`button-regenerate-thesis-${holding.ticker}`}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Regenerate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDeleteThesis(holding.ticker); }}
                className="h-7 text-xs text-muted-foreground hover:text-red-400"
                data-testid={`button-delete-thesis-${holding.ticker}`}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Delete
              </Button>
            </>
          )}
        </div>
      )}

      {/* Expanded Thesis View */}
      {expanded && thesis && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-4">
          {/* Summary */}
          <p className="text-sm text-foreground/90 leading-relaxed">{thesis.summary}</p>

          {/* Why Own */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Why Own
            </h4>
            <ul className="space-y-1">
              {safeParse(thesis.why_own).map((item: string, i: number) => (
                <li key={i} className="flex items-start text-xs leading-relaxed">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 mt-1.5 flex-shrink-0" />
                  <span className="text-foreground/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Key Drivers */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Key Drivers
            </h4>
            <ul className="space-y-1">
              {safeParse(thesis.key_drivers).map((item: string, i: number) => (
                <li key={i} className="flex items-start text-xs leading-relaxed">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 mt-1.5 flex-shrink-0" />
                  <span className="text-foreground/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Risks */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Risks
            </h4>
            <ul className="space-y-1">
              {safeParse(thesis.risks).map((item: string, i: number) => (
                <li key={i} className="flex items-start text-xs leading-relaxed">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-2 mt-1.5 flex-shrink-0" />
                  <span className="text-foreground/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* What Must Be True */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              What Must Be True
            </h4>
            <ul className="space-y-1">
              {safeParse(thesis.what_must_be_true).map((item: string, i: number) => (
                <li key={i} className="flex items-start text-xs leading-relaxed">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-2 mt-1.5 flex-shrink-0" />
                  <span className="text-foreground/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* WMBT Tracker — inline below "What Must Be True" */}
          <WmbtTracker ticker={holding.ticker} thesisItems={wmbtItems} />

          {/* Break Conditions */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Break Conditions
            </h4>
            <ul className="space-y-1">
              {safeParse(thesis.break_conditions).map((item: string, i: number) => (
                <li key={i} className="flex items-start text-xs leading-relaxed">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-2 mt-1.5 flex-shrink-0" />
                  <span className="text-foreground/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Valuation View */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Valuation View
            </h4>
            <p className="text-xs text-foreground/80 leading-relaxed">{thesis.valuation_view}</p>
          </div>

          {/* Thesis actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onGenerateThesis(holding.ticker)}
              className="h-7 text-xs text-muted-foreground"
              data-testid={`button-regenerate-thesis-expanded-${holding.ticker}`}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Regenerate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeleteThesis(holding.ticker)}
              className="h-7 text-xs text-muted-foreground hover:text-red-400"
              data-testid={`button-delete-thesis-expanded-${holding.ticker}`}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
          </div>

          {/* Devil's Advocate Section */}
          {da ? (
            <div className="border-t border-border/50 pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Devil's Advocate
                </h3>
                <VerdictBadge verdict={da.verdict} />
              </div>

              {/* Bear Headline */}
              <p className="text-sm font-semibold text-red-400 leading-snug">{da.bear_headline}</p>

              {/* Counter Arguments */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Bear Case
                </h4>
                <ul className="space-y-1">
                  {safeParse(da.counter_arguments).map((item: any, i: number) => (
                    <li key={i} className="flex items-start text-xs leading-relaxed">
                      <SeverityDot severity={item.severity || "low"} />
                      <span className="text-foreground/80">
                        {item.argument}
                        <span className="ml-1 text-[10px] text-muted-foreground uppercase">
                          ({item.severity})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Blind Spots */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Blind Spots
                </h4>
                <ul className="space-y-1">
                  {safeParse(da.blind_spots).map((item: string, i: number) => (
                    <li key={i} className="flex items-start text-xs leading-relaxed">
                      <AlertTriangle className="w-3 h-3 text-amber-400 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-foreground/80">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Worst Case */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Worst Case
                </h4>
                <p className="text-xs text-foreground/80 leading-relaxed">{da.worst_case_scenario}</p>
              </div>

              {/* Conviction Challenge */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Conviction Challenge
                </h4>
                <p className="text-xs text-foreground/80 leading-relaxed italic">
                  "{da.conviction_challenge}"
                </p>
              </div>
            </div>
          ) : (
            <div className="border-t border-border/50 pt-3">
              {isGeneratingDA ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <p className="text-[11px] text-red-400 animate-pulse mt-1">Building bear case...</p>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerateDA(holding.ticker)}
                  className="h-7 text-xs"
                  data-testid={`button-generate-da-${holding.ticker}`}
                >
                  <ShieldAlert className="w-3 h-3 mr-1" />
                  Generate Bear Case
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ThesisPage ───────────────────────────────────────────────────────────────

export default function ThesisPage() {
  const { toast } = useToast();
  const [generatingThesis, setGeneratingThesis] = useState<string | null>(null);
  const [generatingDA, setGeneratingDA] = useState<string | null>(null);

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  const { data: prices = {} as PriceData, isLoading: pricesLoading } = useQuery<PriceData>({
    queryKey: ["/api/prices"],
    staleTime: 60000,
  });

  const { data: enrichments = [] } = useQuery<Enrichment[]>({
    queryKey: ["/api/enrichments"],
  });

  const { data: allTheses = [], isLoading: thesesLoading } = useQuery<Thesis[]>({
    queryKey: ["/api/theses"],
  });

  const { data: allDAs = [] } = useQuery<DevilsAdvocate[]>({
    queryKey: ["/api/devils-advocates"],
  });

  const enrichmentMap = useMemo(() => {
    const m = new Map<string, Enrichment>();
    for (const e of enrichments) m.set(e.ticker, e);
    return m;
  }, [enrichments]);

  const thesisMap = useMemo(() => {
    const m = new Map<string, Thesis>();
    for (const t of allTheses) m.set(t.ticker, t);
    return m;
  }, [allTheses]);

  const daMap = useMemo(() => {
    const m = new Map<string, DevilsAdvocate>();
    for (const d of allDAs) m.set(d.ticker, d);
    return m;
  }, [allDAs]);

  // Compute mkt values & sort by market value
  const enrichedHoldings = useMemo(() => {
    return holdings
      .map((h) => {
        const p = prices[h.ticker];
        const currentPrice = p?.price ?? 0;
        const mktValue = currentPrice * h.shares;
        return { ...h, currentPrice, mktValue };
      })
      .sort((a, b) => b.mktValue - a.mktValue);
  }, [holdings, prices]);

  const totalMktValue = useMemo(
    () => enrichedHoldings.reduce((s, h) => s + h.mktValue, 0),
    [enrichedHoldings]
  );

  const thesisCount = allTheses.length;
  const daCount = allDAs.length;

  const handleGenerateThesis = async (ticker: string) => {
    setGeneratingThesis(ticker);
    try {
      await apiRequest("POST", `/api/thesis/${ticker}/generate`);
      await queryClient.invalidateQueries({ queryKey: ["/api/theses"] });
      toast({ title: `Thesis generated for ${ticker}` });
    } catch (err: any) {
      toast({ title: `Failed to generate thesis for ${ticker}`, variant: "destructive" });
    }
    setGeneratingThesis(null);
  };

  const handleDeleteThesis = async (ticker: string) => {
    try {
      await apiRequest("DELETE", `/api/thesis/${ticker}`);
      await apiRequest("DELETE", `/api/devils-advocate/${ticker}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/theses"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/devils-advocates"] });
      toast({ title: "Thesis deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleGenerateDA = async (ticker: string) => {
    setGeneratingDA(ticker);
    try {
      await apiRequest("POST", `/api/devils-advocate/${ticker}/generate`);
      await queryClient.invalidateQueries({ queryKey: ["/api/devils-advocates"] });
      toast({ title: `Bear case generated for ${ticker}` });
    } catch (err: any) {
      toast({ title: `Failed to generate bear case for ${ticker}`, variant: "destructive" });
    }
    setGeneratingDA(null);
  };

  const isLoading = holdingsLoading || pricesLoading || thesesLoading;

  return (
    <div className="space-y-4" data-testid="thesis-page">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground" data-testid="text-thesis-title">
            Thesis Coverage
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI-generated investment theses for your holdings
          </p>
        </div>
      </div>

      {/* Coverage Summary */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{thesisCount}</span>/{holdings.length} holdings have thesis
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{daCount}</span> have devil's advocate
          </span>
        </div>
      </div>

      {/* Holdings Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="thesis-holdings-grid">
          {enrichedHoldings.map((h) => (
            <HoldingCard
              key={h.id}
              holding={h}
              enrichment={enrichmentMap.get(h.ticker)}
              thesis={thesisMap.get(h.ticker)}
              da={daMap.get(h.ticker)}
              mktValue={h.mktValue}
              weight={totalMktValue > 0 ? (h.mktValue / totalMktValue) * 100 : 0}
              onGenerateThesis={handleGenerateThesis}
              onDeleteThesis={handleDeleteThesis}
              onGenerateDA={handleGenerateDA}
              generatingThesis={generatingThesis}
              generatingDA={generatingDA}
            />
          ))}
        </div>
      )}
    </div>
  );
}

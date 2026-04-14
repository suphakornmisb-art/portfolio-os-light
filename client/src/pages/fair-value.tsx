import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, TrendingDown, TrendingUp, Minus, ChevronDown, ChevronUp } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";

interface FairValueItem {
  ticker: string;
  business_type: string;
  anchor_metric: string;
  anchor_value: number;
  reference_multiple: number;
  reference_source: string;
  quality_adjustment: number;
  fair_value: number;
  fair_value_low: number;
  fair_value_high: number;
  uncertainty_class: string;
  band_pct: number;
  price: number;
  pfv_ratio: number;
  valuation_label: string;
  method_trace: string;
  confidence: string;
}

const valLabelColor: Record<string, string> = {
  "Deep Discount": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Discount: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  "Fair Range": "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  Premium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Rich: "bg-red-500/20 text-red-400 border-red-500/30",
};

const bddColors: Record<string, string> = {
  engine: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  builder: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  grounder: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  moonshot: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const uncertaintyColors: Record<string, string> = {
  Low: "text-emerald-500",
  Medium: "text-zinc-400",
  High: "text-amber-500",
  "Very High": "text-orange-500",
  Extreme: "text-red-500",
};

function FairValueCard({ item }: { item: FairValueItem }) {
  const [expanded, setExpanded] = useState(false);
  const { formatAmount } = useCurrency();

  // Range bar: show where price sits within FV range
  const rangeMin = item.fair_value_low * 0.7;
  const rangeMax = item.fair_value_high * 1.3;
  const rangeSpan = rangeMax - rangeMin;
  const pricePos = rangeSpan > 0 ? Math.min(100, Math.max(0, ((item.price - rangeMin) / rangeSpan) * 100)) : 50;
  const fvLowPos = rangeSpan > 0 ? ((item.fair_value_low - rangeMin) / rangeSpan) * 100 : 25;
  const fvHighPos = rangeSpan > 0 ? ((item.fair_value_high - rangeMin) / rangeSpan) * 100 : 75;
  const fvMidPos = rangeSpan > 0 ? ((item.fair_value - rangeMin) / rangeSpan) * 100 : 50;

  return (
    <div
      className="rounded-lg border border-border bg-card p-3.5 hover:border-primary/30 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
      data-testid={`card-fv-${item.ticker}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground" data-testid={`text-ticker-${item.ticker}`}>{item.ticker}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${bddColors[item.business_type] || "bg-zinc-500/20 text-zinc-400"}`}>
            {item.business_type.replace("_", " ")}
          </Badge>
        </div>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${valLabelColor[item.valuation_label] || ""}`}>
          {item.valuation_label}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2.5">
        <div>
          <div className="text-[10px] text-muted-foreground">Price</div>
          <div className="font-mono text-xs text-foreground" data-testid={`text-price-${item.ticker}`}>
            {formatAmount(item.price)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Fair Value</div>
          <div className="font-mono text-xs text-foreground">
            {formatAmount(item.fair_value)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">P/FV</div>
          <div className={`font-mono text-xs font-medium ${item.pfv_ratio < 0.85 ? "text-emerald-400" : item.pfv_ratio > 1.15 ? "text-red-400" : "text-zinc-400"}`}>
            {item.pfv_ratio.toFixed(2)}x
          </div>
        </div>
      </div>

      {/* Range bar */}
      <div className="relative h-2 bg-muted rounded-full mb-1.5 overflow-visible">
        {/* Fair range zone */}
        <div
          className="absolute h-full bg-zinc-600/50 rounded-full"
          style={{ left: `${fvLowPos}%`, width: `${fvHighPos - fvLowPos}%` }}
        />
        {/* FV midpoint */}
        <div
          className="absolute top-0 h-full w-0.5 bg-zinc-400"
          style={{ left: `${fvMidPos}%` }}
        />
        {/* Price marker */}
        <div
          className={`absolute -top-0.5 w-3 h-3 rounded-full border-2 border-background ${item.pfv_ratio < 0.85 ? "bg-emerald-400" : item.pfv_ratio > 1.15 ? "bg-red-400" : "bg-zinc-400"}`}
          style={{ left: `${pricePos}%`, transform: "translateX(-50%)" }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className={`text-[10px] ${uncertaintyColors[item.uncertainty_class] || "text-zinc-400"}`}>
          {item.uncertainty_class} uncertainty
        </span>
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2 text-[11px] text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>Anchor: <span className="text-foreground font-mono">{item.anchor_metric} {formatAmount(item.anchor_value)}</span></div>
            <div>Multiple: <span className="text-foreground font-mono">{item.reference_multiple.toFixed(1)}x</span></div>
            <div>Quality Adj: <span className={`font-mono ${item.quality_adjustment > 0 ? "text-emerald-400" : item.quality_adjustment < 0 ? "text-red-400" : "text-zinc-400"}`}>{item.quality_adjustment >= 0 ? "+" : ""}{(item.quality_adjustment * 100).toFixed(0)}%</span></div>
            <div>Range: <span className="text-foreground font-mono">{formatAmount(item.fair_value_low)}–{formatAmount(item.fair_value_high)}</span></div>
          </div>
          <p className="text-[10px] leading-relaxed">{item.method_trace}</p>
        </div>
      )}
    </div>
  );
}

export default function FairValuePage() {
  const { toast } = useToast();

  const { data: fairValues = [], isLoading } = useQuery<FairValueItem[]>({
    queryKey: ["/api/fair-value"],
    staleTime: 60000,
  });

  const enrichAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enrichments/refresh-all");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Enriched ${data.enriched} holdings` });
      queryClient.invalidateQueries({ queryKey: ["/api/fair-value"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enrichments"] });
    },
    onError: () => {
      toast({ title: "Enrichment failed", variant: "destructive" });
    },
  });

  const sorted = [...fairValues].sort((a, b) => a.pfv_ratio - b.pfv_ratio);
  const undervalued = sorted.filter((v) => v.valuation_label === "Deep Discount" || v.valuation_label === "Discount").length;
  const fair = sorted.filter((v) => v.valuation_label === "Fair Range").length;
  const overvalued = sorted.filter((v) => v.valuation_label === "Premium" || v.valuation_label === "Rich").length;
  const avgPfv = sorted.length > 0 ? sorted.reduce((s, v) => s + v.pfv_ratio, 0) / sorted.length : 0;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground" data-testid="text-fv-title">Fair Value Lens</h2>
          <p className="text-xs text-muted-foreground">Deterministic valuation based on 5yr median multiples + quality adjustments</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => enrichAllMutation.mutate()}
          disabled={enrichAllMutation.isPending}
          data-testid="button-enrich-all"
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${enrichAllMutation.isPending ? "animate-spin" : ""}`} />
          {enrichAllMutation.isPending ? "Enriching…" : "Enrich All"}
        </Button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Undervalued</span>
          </div>
          <span className="font-mono text-lg font-semibold text-emerald-400" data-testid="text-undervalued-count">{undervalued}</span>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Minus className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Fair</span>
          </div>
          <span className="font-mono text-lg font-semibold text-zinc-400" data-testid="text-fair-count">{fair}</span>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Overvalued</span>
          </div>
          <span className="font-mono text-lg font-semibold text-red-400" data-testid="text-overvalued-count">{overvalued}</span>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg P/FV</span>
          </div>
          <span className={`font-mono text-lg font-semibold ${avgPfv < 0.95 ? "text-emerald-400" : avgPfv > 1.05 ? "text-red-400" : "text-zinc-400"}`} data-testid="text-avg-pfv">
            {avgPfv.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">No fair value data yet.</p>
          <p className="text-xs text-muted-foreground">Click "Enrich All" to fetch fundamental data from FMP and compute fair values.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((item) => (
            <FairValueCard key={item.ticker} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

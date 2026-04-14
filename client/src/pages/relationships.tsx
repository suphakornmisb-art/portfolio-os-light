import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, AlertTriangle, Network, Lightbulb, Link2, Layers } from "lucide-react";

interface RelNode {
  ticker: string;
  bdd_type: string;
  sector: string;
  industry: string;
  weight: number;
}

interface RelEdge {
  source: string;
  target: string;
  type: string;
  reason: string;
  strength: number;
}

interface RelCluster {
  name: string;
  description: string;
  tickers: string[];
  theme: string;
}

interface HiddenConcentration {
  theme: string;
  tickers: string[];
  risk_note: string;
}

interface RelationshipsData {
  nodes: RelNode[];
  edges: RelEdge[];
  clusters: RelCluster[];
  hidden_concentrations: HiddenConcentration[];
  key_insights: string[];
  source: "llm" | "fallback";
}

const bddColors: Record<string, { fill: string; text: string }> = {
  engine: { fill: "#3b82f6", text: "text-blue-400" },
  builder: { fill: "#f59e0b", text: "text-amber-400" },
  grounder: { fill: "#10b981", text: "text-emerald-400" },
  moonshot: { fill: "#a855f7", text: "text-purple-400" },
};

const edgeTypeColors: Record<string, string> = {
  supply_chain: "#ef4444",
  revenue_correlation: "#f59e0b",
  thematic: "#3b82f6",
  inverse: "#a855f7",
  sector_overlap: "#6b7280",
  competitor: "#ec4899",
};

const edgeTypeLabels: Record<string, string> = {
  supply_chain: "Supply Chain",
  revenue_correlation: "Revenue Correlation",
  thematic: "Thematic",
  inverse: "Inverse/Hedge",
  sector_overlap: "Sector Overlap",
  competitor: "Competitor",
};

function RelGraph({ nodes, edges }: { nodes: RelNode[]; edges: RelEdge[] }) {
  const layout = useMemo(() => {
    // Circular layout grouped by sector
    const sectorMap = new Map<string, RelNode[]>();
    for (const n of nodes) {
      const s = n.sector || "Other";
      if (!sectorMap.has(s)) sectorMap.set(s, []);
      sectorMap.get(s)!.push(n);
    }
    const sectors = Array.from(sectorMap.entries());
    const positions = new Map<string, { x: number; y: number }>();

    const cx = 300;
    const cy = 250;
    const mainRadius = 180;
    let sectorAngle = 0;
    const sectorStep = (2 * Math.PI) / Math.max(1, sectors.length);

    for (const [, group] of sectors) {
      const sectorCx = cx + Math.cos(sectorAngle) * mainRadius;
      const sectorCy = cy + Math.sin(sectorAngle) * mainRadius;

      if (group.length === 1) {
        positions.set(group[0].ticker, { x: sectorCx, y: sectorCy });
      } else {
        const subRadius = Math.min(50, 15 * group.length);
        const subStep = (2 * Math.PI) / group.length;
        group.forEach((n, i) => {
          positions.set(n.ticker, {
            x: sectorCx + Math.cos(i * subStep) * subRadius,
            y: sectorCy + Math.sin(i * subStep) * subRadius,
          });
        });
      }
      sectorAngle += sectorStep;
    }

    return positions;
  }, [nodes]);

  // Filter to only interesting edges (non-sector_overlap) for cleaner graph
  const interestingEdges = edges.filter((e) => e.type !== "sector_overlap");
  const visibleEdges = interestingEdges.length > 0 ? interestingEdges.slice(0, 20) : edges.slice(0, 15);

  return (
    <div className="rounded-lg border border-border bg-card p-4 overflow-hidden">
      <svg viewBox="0 0 600 500" className="w-full h-auto" style={{ minHeight: 300 }}>
        {/* Edges */}
        {visibleEdges.map((edge, i) => {
          const from = layout.get(edge.source);
          const to = layout.get(edge.target);
          if (!from || !to) return null;
          const color = edgeTypeColors[edge.type] || "#4b5563";
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={color}
              strokeWidth={edge.strength > 0.8 ? 2 : 1}
              opacity={edge.strength > 0.7 ? 0.5 : 0.25}
              strokeDasharray={edge.type === "inverse" ? "4 3" : "none"}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = layout.get(node.ticker);
          if (!pos) return null;
          const r = Math.max(6, Math.min(22, node.weight * 1.8));
          const color = bddColors[node.bdd_type]?.fill || "#71717a";

          return (
            <g key={node.ticker}>
              <circle cx={pos.x} cy={pos.y} r={r} fill={color} opacity="0.7" stroke={color} strokeWidth="1" />
              {node.weight > 1.5 && (
                <text
                  x={pos.x}
                  y={pos.y + r + 11}
                  textAnchor="middle"
                  fill="hsl(210,20%,85%)"
                  fontSize="8"
                  fontFamily="Inter, sans-serif"
                  fontWeight="500"
                >
                  {node.ticker}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        {Object.entries(bddColors).map(([type, c]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.fill, opacity: 0.7 }} />
            {type}
          </div>
        ))}
        {interestingEdges.length > 0 && (
          <>
            <span className="mx-1 text-border">|</span>
            {Object.entries(edgeTypeColors).filter(([t]) => interestingEdges.some((e) => e.type === t)).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color, opacity: 0.7 }} />
                {edgeTypeLabels[type] || type}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function RelationshipsPage() {
  const { toast } = useToast();

  const { data: rel, isLoading } = useQuery<RelationshipsData>({
    queryKey: ["/api/relationships"],
    staleTime: 60000,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/relationships/analyze");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Relationship analysis complete" });
      queryClient.invalidateQueries({ queryKey: ["/api/relationships"] });
    },
    onError: () => {
      toast({ title: "Analysis failed", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!rel) return null;

  const isLLM = rel.source === "llm";

  // Group edges by type
  const edgesByType = new Map<string, RelEdge[]>();
  for (const edge of rel.edges) {
    if (!edgesByType.has(edge.type)) edgesByType.set(edge.type, []);
    edgesByType.get(edge.type)!.push(edge);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground" data-testid="text-rel-title">Relationships</h2>
          <p className="text-xs text-muted-foreground">
            {isLLM
              ? "AI-powered analysis of portfolio connections, supply chains, and hidden concentrations"
              : "Run AI analysis to discover non-obvious relationships between your holdings"}
          </p>
        </div>
        <Button
          size="sm"
          variant={isLLM ? "outline" : "default"}
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
          data-testid="button-analyze"
          className="gap-1.5"
        >
          <Sparkles className={`h-3.5 w-3.5 ${analyzeMutation.isPending ? "animate-pulse" : ""}`} />
          {analyzeMutation.isPending ? "Analyzing…" : isLLM ? "Re-analyze" : "Analyze Relationships"}
        </Button>
      </div>

      {/* Source badge */}
      {isLLM && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
            AI-Powered Analysis
          </Badge>
          <span className="text-[10px] text-muted-foreground">via Groq Llama 3.3 70B</span>
        </div>
      )}

      {/* Key Insights */}
      {rel.key_insights.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">Key Insights</span>
          </div>
          <ul className="space-y-1.5">
            {rel.key_insights.map((insight, i) => (
              <li key={i} className="text-xs text-foreground/80 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-primary/60">
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Hidden concentrations */}
      {rel.hidden_concentrations.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-medium text-amber-400">Hidden Concentrations</span>
          </div>
          <div className="space-y-2">
            {rel.hidden_concentrations.map((hc, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-foreground">{hc.theme}</span>
                  {hc.tickers.map((t) => (
                    <span key={t} className="text-[10px] font-mono text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">{hc.risk_note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Network graph */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Network className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-medium text-foreground">Network Graph</span>
          </div>
          <RelGraph nodes={rel.nodes} edges={rel.edges} />
        </div>

        {/* Right column: Thematic Clusters */}
        <div className="space-y-4">
          {/* Thematic clusters */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {isLLM ? "Thematic Clusters" : "Sector Clusters"}
              </span>
            </div>
            <div className="space-y-2">
              {rel.clusters.map((cluster, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-card p-3" data-testid={`card-cluster-${idx}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{cluster.name}</span>
                    {cluster.theme && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-3.5 text-muted-foreground">
                        {cluster.theme}
                      </Badge>
                    )}
                  </div>
                  {cluster.description && (
                    <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">{cluster.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {cluster.tickers.map((t) => {
                      const node = rel.nodes.find((n) => n.ticker === t);
                      const color = bddColors[node?.bdd_type || ""]?.fill || "#71717a";
                      return (
                        <span
                          key={t}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                          style={{ borderColor: `${color}33`, color: color + "cc", backgroundColor: `${color}11` }}
                        >
                          {t}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Connection types */}
          {isLLM && edgesByType.size > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-medium text-foreground">Connections by Type</span>
              </div>
              <div className="space-y-2">
                {Array.from(edgesByType.entries())
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([type, typeEdges]) => (
                    <div key={type} className="rounded-lg border border-border bg-card p-3" data-testid={`card-edgetype-${type}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: edgeTypeColors[type] || "#6b7280", opacity: 0.7 }} />
                        <span className="text-xs font-medium text-foreground">{edgeTypeLabels[type] || type}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{typeEdges.length}</span>
                      </div>
                      <div className="space-y-1">
                        {typeEdges.slice(0, 5).map((edge, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[10px] font-mono text-foreground/80 shrink-0 w-24">
                              {edge.source} ↔ {edge.target}
                            </span>
                            <span className="text-[10px] text-muted-foreground leading-relaxed">{edge.reason}</span>
                          </div>
                        ))}
                        {typeEdges.length > 5 && (
                          <span className="text-[10px] text-muted-foreground">+{typeEdges.length - 5} more</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty state CTA if fallback */}
      {!isLLM && rel.edges.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Discover hidden connections</p>
          <p className="text-xs text-muted-foreground mb-4">
            AI analysis identifies supply chain dependencies, thematic overlaps, revenue correlations, and hidden concentration risks across your portfolio.
          </p>
          <Button
            size="sm"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            data-testid="button-analyze-cta"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Analyze Relationships
          </Button>
        </div>
      )}
    </div>
  );
}

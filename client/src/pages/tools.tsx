import { Link } from "wouter";
import { DollarSign, Target, TrendingDown, Download, ArrowRight, Wrench } from "lucide-react";

const TOOLS = [
  {
    path: "/tools/capital",
    icon: DollarSign,
    title: "Capital Deployment",
    description: "Allocate new cash across your portfolio using gap scoring and fair value discounts",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    path: "/tools/position-sizing",
    icon: Target,
    title: "Position Sizing",
    description: "Calculate suggested position size based on conviction level and BDD type",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    path: "/tools/cost-basis",
    icon: TrendingDown,
    title: "Cost Basis Optimizer",
    description: "Calculate how many shares to buy to reach a target average cost",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    path: "/tools/export",
    icon: Download,
    title: "Export Snapshot",
    description: "Download your portfolio as CSV or full JSON snapshot for archiving",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
];

export default function ToolsPage() {
  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          Tools
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Portfolio analysis and management utilities
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.path} href={tool.path}>
              <div
                className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-card/80 transition-all cursor-pointer group"
                data-testid={`card-tool-${tool.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${tool.bg} shrink-0`}>
                      <Icon className={`w-4 h-4 ${tool.color}`} />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">{tool.title}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

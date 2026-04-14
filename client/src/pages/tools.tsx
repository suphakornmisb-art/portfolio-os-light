import { Link } from "wouter";
import { DollarSign, Target, TrendingDown, Download, Camera, ArrowRight, Wrench, FlaskConical, Bot, Eye, Coins, Layers, LayoutGrid, ArrowLeftRight, PieChart } from "lucide-react";

const TOOLS = [
  {
    path: "/tools/buy-engine",
    icon: Bot,
    title: "Buy Decision Engine",
    description: "Deterministic per-holding score: Strong Buy / Buy / Hold / Review / Reduce",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    path: "/tools/milestones",
    icon: Target,
    title: "Milestones & Wealth Path",
    description: "Track your journey: 2M → 3M → 5M → 10M THB wealth targets",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    path: "/tools/dividends",
    icon: Coins,
    title: "Dividend & Income Ledger",
    description: "Log dividends, track yield-on-cost, project annual income",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    path: "/tools/watchlist",
    icon: Eye,
    title: "Watchlist",
    description: "Track stocks you're watching with buy-below price targets",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
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
  {
    path: "/tools/import",
    icon: Camera,
    title: "Screenshot Import",
    description: "Upload Dime! screenshots to import or sync your portfolio holdings",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
  },
  {
    path: "/tools/scenarios",
    icon: FlaskConical,
    title: "Scenario Studio",
    description: "Stress-test your portfolio against 26 regulatory and historical scenarios (Fed, BoE, EBA, MSCI)",
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  {
    path: "/tools/concentration",
    icon: Layers,
    title: "Concentration Risk",
    description: "Cross-theme exposure: cloud, AI, fintech, and more across sector labels",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
  },
  {
    path: "/tools/heatmap",
    icon: LayoutGrid,
    title: "Markets Heatmap",
    description: "Live sector heatmap with your holdings highlighted by today's performance",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    path: "/tools/fx",
    icon: ArrowLeftRight,
    title: "THB FX Tracker",
    description: "Isolate FX P\u0026L from equity P\u0026L \u2014 see how USD/THB rate changes affect your returns",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
  {
    path: "/tools/attribution",
    icon: PieChart,
    title: "Performance Attribution",
    description: "Return decomposed by BDD sleeve, sector, and individual stock vs S\u0026P 500",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
  },
  {
    path: "/tools/drawdown",
    icon: TrendingDown,
    title: "Drawdown Stress Tester",
    description: "Simulate −20% to −50% market drops — beta-adjusted per-holding impact",
    color: "text-red-400",
    bg: "bg-red-500/10",
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

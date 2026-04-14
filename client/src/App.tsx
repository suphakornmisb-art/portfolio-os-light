import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import FairValuePage from "@/pages/fair-value";
import PerformancePage from "@/pages/performance";
import RelationshipsPage from "@/pages/relationships";
import ThesisPage from "@/pages/thesis";
import AlertsPage from "@/pages/alerts";
import ToolsHub from "@/pages/tools";
import ToolsCapital from "@/pages/tools-capital";
import ToolsPosition from "@/pages/tools-position";
import ToolsCostBasis from "@/pages/tools-costbasis";
import ToolsExport from "@/pages/tools-export";
import ToolsImport from "@/pages/tools-import";
import EducationPage from "@/pages/education";
import ScenarioStudio from "@/pages/scenario-studio";
import MilestonesPage from "@/pages/milestones";
import DividendsPage from "@/pages/dividends";
import WatchlistPage from "@/pages/watchlist-page";
import BuyEnginePage from "@/pages/buy-engine";
import DrawdownTesterPage from "@/pages/drawdown-tester";
import FxTrackerPage from "@/pages/fx-tracker";
import AttributionPage from "@/pages/attribution";
import ConcentrationRiskPage from "@/pages/concentration-risk";
import HeatmapPage from "@/pages/heatmap";
import StockDetailPage from "@/pages/stock-detail";
import { CurrencyProvider, useCurrency } from "@/contexts/CurrencyContext";
import {
  LayoutGrid,
  Scale,
  TrendingUp,
  Brain,
  Bell,
  Wrench,
  BookOpen,
} from "lucide-react";

// ─── Navigation config ────────────────────────────────────────────────────────

const TABS = [
  { path: "/", label: "Portfolio", icon: LayoutGrid },
  { path: "/fair-value", label: "Fair Value", icon: Scale },
  { path: "/performance", label: "Performance", icon: TrendingUp },
  { path: "/thesis", label: "Thesis", icon: Brain },
  { path: "/alerts", label: "Alerts", icon: Bell },
  { path: "/tools", label: "Tools", icon: Wrench },
  { path: "/education", label: "Education", icon: BookOpen },
];

// ─── Currency Toggle Pill ─────────────────────────────────────────────────────

function CurrencyToggle() {
  const { currency, toggle } = useCurrency();
  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-muted/50 hover:border-primary/40 hover:bg-muted transition-colors text-[11px] font-mono font-medium"
      data-testid="button-currency-toggle"
      title="Toggle USD / THB"
    >
      <span className={currency === "USD" ? "text-primary" : "text-muted-foreground"}>$</span>
      <span className="text-muted-foreground/40">/</span>
      <span className={currency === "THB" ? "text-primary" : "text-muted-foreground"}>฿</span>
    </button>
  );
}

// ─── Exchange Rate Line ───────────────────────────────────────────────────────

function ExchangeRateLine() {
  const { currency, rateData, rate } = useCurrency();
  if (currency !== "THB") return null;

  let ago = "";
  if (rateData?.cached_at) {
    const diffMs = Date.now() - new Date(rateData.cached_at).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    ago = diffMin < 1 ? "just now" : `${diffMin}m ago`;
  }

  return (
    <div className="text-[10px] text-muted-foreground font-mono text-center py-1 border-t border-border/30 bg-background/60">
      1 USD = {rate.toFixed(2)} THB{ago ? ` · updated ${ago}` : ""}
    </div>
  );
}

// ─── Top nav (desktop md+) ────────────────────────────────────────────────────

function TopNav() {
  const [location] = useLocation();
  return (
    <nav className="hidden md:block border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[1400px] mx-auto px-6 flex items-center gap-0">
        {/* Logo mark */}
        <div className="flex items-center gap-2 mr-6 py-2.5">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-label="Portfolio OS">
            <circle cx="12" cy="12" r="10" fill="hsl(160 84% 44% / 0.15)" stroke="hsl(160 84% 44%)" strokeWidth="1.5" />
            <path d="M8 8h4.5a2.5 2.5 0 0 1 0 5H8V8z" stroke="hsl(160 84% 44%)" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 13h5.5" stroke="hsl(160 84% 44%)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-mono font-semibold text-primary tracking-wide">OS LIGHT</span>
        </div>

        {TABS.map((tab) => {
          // Mark tools/* and alerts as active when on sub-routes
          const isActive =
            tab.path === "/"
              ? location === "/"
              : location === tab.path || location.startsWith(tab.path + "/");
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={`px-3.5 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground/80"
              }`}
              data-testid={`tab-${tab.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              {tab.label}
            </Link>
          );
        })}

        {/* Spacer + currency toggle */}
        <div className="ml-auto py-2.5">
          <CurrencyToggle />
        </div>
      </div>
      <ExchangeRateLine />
    </nav>
  );
}

// ─── Bottom nav (mobile, <md) ─────────────────────────────────────────────────

function BottomNav() {
  const [location] = useLocation();
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {TABS.filter((t) => t.path !== "/education").map((tab) => {
          const isActive =
            tab.path === "/"
              ? location === "/"
              : location === tab.path || location.startsWith(tab.path + "/");
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid={`bottom-tab-${tab.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              <Icon className="w-4 h-4" strokeWidth={isActive ? 2 : 1.5} />
              <span className={`text-[9px] font-medium leading-none ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Mobile top header ────────────────────────────────────────────────────────

function MobileHeader() {
  const [location] = useLocation();
  // Find active tab — check sub-routes too
  const current = TABS.find(t =>
    t.path === "/"
      ? location === "/"
      : location === t.path || location.startsWith(t.path + "/")
  );
  return (
    <header className="md:hidden sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="flex items-center gap-2.5 px-4 h-11" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-label="Portfolio OS">
          <circle cx="12" cy="12" r="10" fill="hsl(160 84% 44% / 0.15)" stroke="hsl(160 84% 44%)" strokeWidth="1.5" />
          <path d="M8 8h4.5a2.5 2.5 0 0 1 0 5H8V8z" stroke="hsl(160 84% 44%)" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span className="text-xs font-mono font-semibold text-primary">OS LIGHT</span>
        <span className="text-xs text-muted-foreground ml-1">{current?.label}</span>
        <div className="ml-auto">
          <CurrencyToggle />
        </div>
      </div>
      <ExchangeRateLine />
    </header>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 pb-24">
      {children}
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <MobileHeader />
      <PageWrapper>{children}</PageWrapper>
      <BottomNav />
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

function AppRouter() {
  return (
    <Switch>
      <Route path="/">
        {() => <Shell><Dashboard /></Shell>}
      </Route>
      <Route path="/fair-value">
        {() => <Shell><FairValuePage /></Shell>}
      </Route>
      <Route path="/performance">
        {() => <Shell><PerformancePage /></Shell>}
      </Route>
      <Route path="/relationships">
        {() => <Shell><RelationshipsPage /></Shell>}
      </Route>
      <Route path="/thesis">
        {() => <Shell><ThesisPage /></Shell>}
      </Route>
      <Route path="/alerts">
        {() => <Shell><AlertsPage /></Shell>}
      </Route>
      {/* Tools sub-routes — specific routes before hub */}
      <Route path="/tools/capital">
        {() => <Shell><ToolsCapital /></Shell>}
      </Route>
      <Route path="/tools/position-sizing">
        {() => <Shell><ToolsPosition /></Shell>}
      </Route>
      <Route path="/tools/cost-basis">
        {() => <Shell><ToolsCostBasis /></Shell>}
      </Route>
      <Route path="/tools/export">
        {() => <Shell><ToolsExport /></Shell>}
      </Route>
      <Route path="/tools/import">
        {() => <Shell><ToolsImport /></Shell>}
      </Route>
      <Route path="/tools/scenarios">
        {() => <Shell><ScenarioStudio /></Shell>}
      </Route>
      <Route path="/tools/milestones">
        {() => <Shell><MilestonesPage /></Shell>}
      </Route>
      <Route path="/tools/dividends">
        {() => <Shell><DividendsPage /></Shell>}
      </Route>
      <Route path="/tools/watchlist">
        {() => <Shell><WatchlistPage /></Shell>}
      </Route>
      <Route path="/tools/buy-engine">
        {() => <Shell><BuyEnginePage /></Shell>}
      </Route>
      <Route path="/tools/fx">
        {() => <Shell><FxTrackerPage /></Shell>}
      </Route>
      <Route path="/tools/attribution">
        {() => <Shell><AttributionPage /></Shell>}
      </Route>
      <Route path="/tools/concentration">
        {() => <Shell><ConcentrationRiskPage /></Shell>}
      </Route>
      <Route path="/tools/heatmap">
        {() => <Shell><HeatmapPage /></Shell>}
      </Route>
      <Route path="/tools/drawdown">
        {() => <Shell><DrawdownTesterPage /></Shell>}
      </Route>
      <Route path="/tools">
        {() => <Shell><ToolsHub /></Shell>}
      </Route>
      <Route path="/education">
        {() => <Shell><EducationPage /></Shell>}
      </Route>
      <Route path="/stock/:ticker">
        {() => <Shell><StockDetailPage /></Shell>}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <CurrencyProvider>
            <AppRouter />
          </CurrencyProvider>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

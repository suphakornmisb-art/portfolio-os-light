import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, FileJson, FileText, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import type { Holding } from "@shared/schema";
import { useCurrency } from "@/contexts/CurrencyContext";
import { fmtPct } from "@/components/format";

type PriceData = Record<string, { price?: number; changesPercentage?: number; name?: string; [k: string]: any }>;

export default function ExportPage() {
  const { formatAmount, currency, rate } = useCurrency();
  const [csvDone, setCsvDone] = useState(false);
  const [jsonDone, setJsonDone] = useState(false);

  const { data: holdings = [] } = useQuery<Holding[]>({ queryKey: ["/api/holdings"] });
  const { data: prices = {} as PriceData } = useQuery<PriceData>({ queryKey: ["/api/prices"], staleTime: 60000 });

  // Client-side CSV generation
  const handleClientCSV = () => {
    let totalMktValue = 0;
    const rows = holdings.map((h) => {
      const q = prices[h.ticker];
      const price = q?.price ?? 0;
      const mktValue = price * h.shares;
      const costBasis = h.avg_cost * h.shares;
      totalMktValue += mktValue;
      return { h, q, price, mktValue, costBasis };
    });

    const currencyLabel = currency === "THB" ? "THB" : "USD";
    const headers = [
      "Ticker", "Shares", `Avg Cost (USD)`,
      `Current Price (${currencyLabel})`, `Market Value (${currencyLabel})`,
      `P&L (${currencyLabel})`, "P&L %", "Day %", "BDD Type", "Sector", "Weight %",
    ];
    if (currency === "THB") {
      headers.push("Market Value (USD)");
    }

    const csvRows = rows.map(({ h, q, price, mktValue, costBasis }) => {
      const pnl = mktValue - costBasis;
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      const weight = totalMktValue > 0 ? (mktValue / totalMktValue) * 100 : 0;
      const dayPct = q?.changesPercentage ?? 0;

      const displayPrice = currency === "THB" ? price * rate : price;
      const displayMktValue = currency === "THB" ? mktValue * rate : mktValue;
      const displayPnl = currency === "THB" ? pnl * rate : pnl;

      const cols = [
        h.ticker, h.shares.toFixed(4), h.avg_cost.toFixed(2),
        displayPrice.toFixed(2), displayMktValue.toFixed(2),
        displayPnl.toFixed(2), pnlPct.toFixed(2), dayPct.toFixed(2),
        h.bdd_type, h.sector, weight.toFixed(2),
      ];
      if (currency === "THB") cols.push(mktValue.toFixed(2));
      return cols.map((v) => `"${v}"`).join(",");
    });

    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setCsvDone(true);
    setTimeout(() => setCsvDone(false), 3000);
  };

  // Server-side JSON export
  const handleJsonExport = async () => {
    try {
      const res = await apiRequest("GET", "/api/export/json");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `portfolio-snapshot-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setJsonDone(true);
      setTimeout(() => setJsonDone(false), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const totalMktValue = holdings.reduce((s, h) => s + (prices[h.ticker]?.price ?? 0) * h.shares, 0);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/tools">
          <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" data-testid="button-back-tools">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Download className="w-5 h-5 text-purple-400" />
            Export Snapshot
          </h1>
          <p className="text-xs text-muted-foreground">Download your portfolio data for archiving or analysis</p>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">
          Portfolio contains{" "}
          <span className="font-semibold text-foreground">{holdings.length} holdings</span>
          {" · "}
          Total value{" "}
          <span className="font-mono font-semibold text-primary">{formatAmount(totalMktValue, true)}</span>
          {currency === "THB" && (
            <span className="ml-1 text-[10px] text-muted-foreground">(USD columns preserved in export)</span>
          )}
        </div>
      </div>

      {/* Export cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <FileText className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Holdings CSV</h2>
              <p className="text-[11px] text-muted-foreground">Spreadsheet-ready with all columns</p>
            </div>
          </div>
          <ul className="text-[11px] text-muted-foreground space-y-0.5">
            <li>· Ticker, shares, avg cost (USD)</li>
            <li>· Price, market value, P&L in {currency}</li>
            <li>· Day %, weight %, BDD type, sector</li>
            {currency === "THB" && <li>· + USD market value column</li>}
          </ul>
          <Button
            onClick={handleClientCSV}
            className="w-full gap-2"
            variant={csvDone ? "outline" : "default"}
            data-testid="button-export-csv"
          >
            {csvDone ? (
              <><CheckCircle className="w-4 h-4 text-emerald-400" /> Downloaded!</>
            ) : (
              <><Download className="w-4 h-4" /> Download CSV</>
            )}
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <FileJson className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Full JSON Snapshot</h2>
              <p className="text-[11px] text-muted-foreground">Complete portfolio state for archiving</p>
            </div>
          </div>
          <ul className="text-[11px] text-muted-foreground space-y-0.5">
            <li>· All holdings with live prices (USD)</li>
            <li>· Fair value data + BDD summary</li>
            <li>· Thesis count + export timestamp</li>
            <li>· Machine-readable for future import</li>
          </ul>
          <Button
            onClick={handleJsonExport}
            className="w-full gap-2"
            variant={jsonDone ? "outline" : "default"}
            data-testid="button-export-json"
          >
            {jsonDone ? (
              <><CheckCircle className="w-4 h-4 text-emerald-400" /> Downloaded!</>
            ) : (
              <><Download className="w-4 h-4" /> Download JSON</>
            )}
          </Button>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        All monetary values in exports use USD as the base currency. {currency === "THB" ? `THB column added at current rate (1 USD = ${rate.toFixed(2)} THB).` : ""}
      </p>
    </div>
  );
}

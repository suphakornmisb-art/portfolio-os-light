import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, BellRing, Trash2, Plus, RefreshCw, CheckCircle } from "lucide-react";
import type { Holding, PriceAlert } from "@shared/schema";
import { useCurrency } from "@/contexts/CurrencyContext";
import { fmtPct } from "@/components/format";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AlertsPage() {
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const [tab, setTab] = useState<"active" | "triggered" | "all">("active");
  const [form, setForm] = useState({
    ticker: "",
    alert_type: "below",
    target_value: "",
    label: "",
  });

  const { data: holdings = [] } = useQuery<Holding[]>({ queryKey: ["/api/holdings"] });
  const { data: alerts = [], isLoading } = useQuery<PriceAlert[]>({ queryKey: ["/api/alerts"] });

  const triggeredCount = alerts.filter((a) => a.triggered).length;

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/alerts", {
        ...data,
        target_value: parseFloat(data.target_value),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setForm({ ticker: "", alert_type: "below", target_value: "", label: "" });
      toast({ title: "Alert created" });
    },
    onError: (e: any) => toast({ title: "Failed to create alert", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert deleted" });
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/alerts/check");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      if (data.triggered.length > 0) {
        toast({
          title: `${data.triggered.length} alert${data.triggered.length > 1 ? "s" : ""} triggered!`,
          description: data.triggered.map((a: any) => `${a.ticker}: ${formatAmount(a.current_price)}`).join(", "),
        });
      } else {
        toast({ title: "No alerts triggered" });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.target_value) return;
    createMutation.mutate(form);
  };

  const filtered = alerts.filter((a) => {
    if (tab === "active") return !a.triggered;
    if (tab === "triggered") return a.triggered;
    return true;
  });

  const alertTypeLabel = (type: string) => {
    if (type === "above") return "Price above";
    if (type === "below") return "Price below";
    return "% move from avg";
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Price Alerts
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set alerts for your holdings — checked manually on demand
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => checkMutation.mutate()}
          disabled={checkMutation.isPending}
          data-testid="button-check-alerts"
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checkMutation.isPending ? "animate-spin" : ""}`} />
          Check Now
        </Button>
      </div>

      {/* Create Alert Form */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          New Alert
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Ticker</label>
            <Select value={form.ticker} onValueChange={(v) => setForm((f) => ({ ...f, ticker: v }))}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-alert-ticker">
                <SelectValue placeholder="Select ticker" />
              </SelectTrigger>
              <SelectContent>
                {holdings.map((h) => (
                  <SelectItem key={h.ticker} value={h.ticker}>{h.ticker}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Type</label>
            <Select value={form.alert_type} onValueChange={(v) => setForm((f) => ({ ...f, alert_type: v }))}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-alert-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="above">Price Above</SelectItem>
                <SelectItem value="below">Price Below</SelectItem>
                <SelectItem value="pct_change">% Move from Avg Cost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
              Value {form.alert_type === "pct_change" ? "(%)" : "(USD)"}
            </label>
            <Input
              type="number"
              step="0.01"
              value={form.target_value}
              onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))}
              placeholder={form.alert_type === "pct_change" ? "e.g. 20" : "e.g. 150.00"}
              className="h-8 text-xs font-mono"
              data-testid="input-alert-value"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Label (optional)</label>
            <div className="flex gap-2">
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Support level"
                className="h-8 text-xs flex-1"
                data-testid="input-alert-label"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!form.ticker || !form.target_value || createMutation.isPending}
                className="h-8 px-3 shrink-0"
                data-testid="button-create-alert"
              >
                Add
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border pb-1">
        {(["active", "triggered", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors capitalize ${
              tab === t ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-alerts-${t}`}
          >
            {t}
            {t === "triggered" && triggeredCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-red-500 text-white font-bold">
                {triggeredCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alerts list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No {tab === "all" ? "" : tab} alerts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-lg border p-3 flex items-center gap-3 transition-colors ${
                alert.triggered
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-border bg-card"
              }`}
              data-testid={`row-alert-${alert.id}`}
            >
              <div className={`shrink-0 ${alert.triggered ? "text-red-400" : "text-muted-foreground"}`}>
                {alert.triggered ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm">{alert.ticker}</span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {alertTypeLabel(alert.alert_type)}
                  </span>
                  <span className="font-mono text-sm font-semibold text-primary">
                    {alert.alert_type === "pct_change"
                      ? `${alert.target_value}%`
                      : formatAmount(alert.target_value)}
                  </span>
                  {alert.label && (
                    <span className="text-xs text-muted-foreground truncate">· {alert.label}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    Created {timeAgo(alert.created_at)}
                  </span>
                  {alert.triggered && alert.triggered_at && (
                    <span className="text-[10px] text-red-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Triggered {timeAgo(alert.triggered_at)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate(alert.id)}
                className="shrink-0 p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                data-testid={`button-delete-alert-${alert.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

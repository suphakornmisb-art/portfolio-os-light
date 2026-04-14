import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Plus, CheckCircle, Trophy, MapPin } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Milestone, Holding } from "@shared/schema";

interface Snapshot {
  id: number;
  date: string;
  total_value: number;
  total_cost: number;
}

function formatMonths(months: number): string {
  if (months < 1) return "< 1 month";
  if (months < 12) return `${Math.round(months)} months`;
  const years = Math.floor(months / 12);
  const rem = Math.round(months % 12);
  if (rem === 0) return `${years} yr${years !== 1 ? "s" : ""}`;
  return `${years} yr${years !== 1 ? "s" : ""} ${rem} mo`;
}

export default function MilestonesPage() {
  const { toast } = useToast();
  const { currency, rate, formatAmount, symbol } = useCurrency();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: "",
    target_value: "",
    target_date: "",
    notes: "",
  });

  const { data: milestones = [], isLoading: msLoading } = useQuery<Milestone[]>({
    queryKey: ["/api/milestones"],
  });

  const { data: snapshots = [] } = useQuery<Snapshot[]>({
    queryKey: ["/api/snapshots"],
  });

  const { data: holdings = [] } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  // Compute current portfolio value from snapshots or holdings fallback
  const currentValueUSD = useMemo(() => {
    if (snapshots.length > 0) {
      const sorted = [...snapshots].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      return sorted[0].total_value;
    }
    // fallback: sum cost basis
    return holdings.reduce((sum, h) => sum + h.shares * h.avg_cost, 0);
  }, [snapshots, holdings]);

  // Compute average monthly growth from snapshots
  const monthlyGrowthRate = useMemo(() => {
    if (snapshots.length < 2) return null;
    const sorted = [...snapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const months =
      (new Date(last.date).getTime() - new Date(first.date).getTime()) /
      (1000 * 60 * 60 * 24 * 30.44);
    if (months < 0.1 || first.total_value <= 0) return null;
    const growthPerMonth = (last.total_value - first.total_value) / months;
    return growthPerMonth;
  }, [snapshots]);

  // current value in user currency
  const currentValueDisplay = currentValueUSD * rate;

  // Create milestone
  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      // target_value is in user currency, convert to USD for storage
      const targetUSD =
        currency === "THB"
          ? parseFloat(data.target_value) / rate
          : parseFloat(data.target_value);
      const res = await apiRequest("POST", "/api/milestones", {
        label: data.label,
        target_value: targetUSD,
        target_date: data.target_date || null,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/milestones"] });
      setForm({ label: "", target_value: "", target_date: "", notes: "" });
      setShowForm(false);
      toast({ title: "Milestone added" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to add milestone", description: e.message, variant: "destructive" }),
  });

  // Mark achieved
  const achieveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/milestones/${id}`, {
        achieved: true,
        achieved_at: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/milestones"] });
      toast({ title: "Milestone marked as achieved!" });
    },
  });

  // Quick-add preset
  const quickAdd = async (labelStr: string, targetTHB: number) => {
    const targetUSD = currency === "THB" ? targetTHB / rate : targetTHB;
    const res = await apiRequest("POST", "/api/milestones", {
      label: labelStr,
      target_value: targetUSD,
      notes: "",
    });
    await res.json();
    queryClient.invalidateQueries({ queryKey: ["/api/milestones"] });
    toast({ title: `${labelStr} milestone added` });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label || !form.target_value) return;
    createMutation.mutate(form);
  };

  // Sort milestones by target_value ascending
  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => a.target_value - b.target_value);
  }, [milestones]);

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Milestones &amp; Wealth Path
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track your journey to financial targets
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="gap-1.5"
          data-testid="button-add-milestone"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Milestone
        </Button>
      </div>

      {/* Current value banner */}
      <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MapPin className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
              Current Portfolio Value
            </div>
            <div className="font-mono text-xl font-semibold text-foreground">
              {formatAmount(currentValueUSD)}
            </div>
          </div>
        </div>
        {snapshots.length >= 2 && monthlyGrowthRate !== null && (
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
              Avg Monthly Growth
            </div>
            <div className="font-mono text-sm font-medium text-emerald-400">
              +{formatAmount(monthlyGrowthRate)}/mo
            </div>
          </div>
        )}
        {snapshots.length < 2 && (
          <div className="text-xs text-muted-foreground italic">
            Take snapshots to estimate timeline
          </div>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            New Milestone
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Label
              </label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. 2M Milestone"
                className="h-8 text-xs"
                data-testid="input-milestone-label"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Target Value ({symbol})
              </label>
              <Input
                type="number"
                step="1"
                value={form.target_value}
                onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))}
                placeholder={currency === "THB" ? "e.g. 2000000" : "e.g. 60000"}
                className="h-8 text-xs font-mono"
                data-testid="input-milestone-target"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Target Date (optional)
              </label>
              <Input
                type="date"
                value={form.target_date}
                onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
                className="h-8 text-xs font-mono"
                data-testid="input-milestone-date"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Notes
              </label>
              <div className="flex gap-2">
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                  className="h-8 text-xs flex-1"
                  data-testid="input-milestone-notes"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!form.label || !form.target_value || createMutation.isPending}
                  className="h-8 px-3 shrink-0"
                  data-testid="button-create-milestone"
                >
                  Add
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Milestones list */}
      {msLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : sortedMilestones.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center space-y-4">
          <Target className="w-8 h-8 text-muted-foreground mx-auto" />
          <div>
            <p className="text-sm font-medium text-foreground">No milestones yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add your first target to track your wealth journey
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              { label: "฿2M Milestone", val: 2_000_000 },
              { label: "฿3M Milestone", val: 3_000_000 },
              { label: "฿5M Family Office Seed", val: 5_000_000 },
              { label: "฿10M Target", val: 10_000_000 },
            ].map((preset) => (
              <Button
                key={preset.val}
                size="sm"
                variant="outline"
                onClick={() => quickAdd(preset.label, preset.val)}
                className="text-xs h-7"
                data-testid={`button-quick-${preset.val}`}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedMilestones.map((ms) => {
            // Convert milestone target to display currency
            const targetDisplay = ms.target_value * rate;
            const progress = Math.min(100, (currentValueDisplay / targetDisplay) * 100);
            const isAchieved = ms.achieved || currentValueDisplay >= targetDisplay;
            const isYouAreHere =
              !ms.achieved &&
              (() => {
                // "you are here" = closest milestone above current value
                const above = sortedMilestones.filter(
                  (m) => !m.achieved && m.target_value * rate > currentValueDisplay
                );
                return above.length > 0 && above[0].id === ms.id;
              })();

            // Months estimate
            let etaText = "";
            if (!isAchieved && monthlyGrowthRate !== null && monthlyGrowthRate > 0) {
              const remaining = (ms.target_value - currentValueUSD);
              const months = remaining / monthlyGrowthRate;
              etaText = months > 0 ? `Est. ${formatMonths(months)} at current pace` : "";
            } else if (!isAchieved && snapshots.length < 2) {
              etaText = "Add snapshots to estimate timeline";
            }

            return (
              <div
                key={ms.id}
                className={`rounded-lg border p-4 transition-colors ${
                  isAchieved
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : isYouAreHere
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-card"
                }`}
                data-testid={`row-milestone-${ms.id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`shrink-0 ${
                        isAchieved
                          ? "text-emerald-400"
                          : isYouAreHere
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {isAchieved ? (
                        <Trophy className="w-4 h-4" />
                      ) : isYouAreHere ? (
                        <MapPin className="w-4 h-4" />
                      ) : (
                        <Target className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-foreground">
                          {symbol}{targetDisplay.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-sm text-foreground">{ms.label}</span>
                        {isYouAreHere && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                            ← YOU ARE HERE
                          </span>
                        )}
                        {isAchieved && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                            ACHIEVED
                          </span>
                        )}
                      </div>
                      {ms.notes && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {ms.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isAchieved && !ms.achieved && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => achieveMutation.mutate(ms.id)}
                      disabled={achieveMutation.isPending}
                      className="h-7 text-xs gap-1 shrink-0"
                      data-testid={`button-achieve-${ms.id}`}
                    >
                      <CheckCircle className="w-3 h-3" />
                      Mark Achieved
                    </Button>
                  )}
                </div>

                {/* Progress bar */}
                {!isAchieved && (
                  <div className="space-y-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-mono text-primary font-medium">
                        {progress.toFixed(1)}% complete
                      </span>
                      {etaText && <span>{etaText}</span>}
                    </div>
                  </div>
                )}

                {isAchieved && ms.achieved_at && (
                  <div className="text-[10px] text-emerald-400 mt-1">
                    Achieved {new Date(ms.achieved_at).toLocaleDateString()}
                  </div>
                )}

                {ms.target_date && !isAchieved && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Target date: {new Date(ms.target_date).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}

          {/* Quick-add preset buttons at the bottom */}
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
              Quick-add presets
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "฿2M Milestone", val: 2_000_000 },
                { label: "฿3M Milestone", val: 3_000_000 },
                { label: "฿5M Family Office Seed", val: 5_000_000 },
                { label: "฿10M Target", val: 10_000_000 },
              ].map((preset) => (
                <Button
                  key={preset.val}
                  size="sm"
                  variant="outline"
                  onClick={() => quickAdd(preset.label, preset.val)}
                  className="text-xs h-7"
                  data-testid={`button-quick-bottom-${preset.val}`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

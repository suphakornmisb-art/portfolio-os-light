import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Plus, Trash2, Pencil, Check, X, Info } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { WatchlistItem } from "@shared/schema";

export default function WatchlistPage() {
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    ticker: "",
    sector: "",
    buy_below: "",
    notes: "",
  });

  const [editForm, setEditForm] = useState({
    ticker: "",
    sector: "",
    buy_below: "",
    notes: "",
  });

  const { data: watchlist = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/watchlist", {
        ticker: data.ticker.toUpperCase().trim(),
        sector: data.sector,
        buy_below: data.buy_below ? parseFloat(data.buy_below) : null,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setForm({ ticker: "", sector: "", buy_below: "", notes: "" });
      setShowForm(false);
      toast({ title: "Added to watchlist" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to add", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof editForm }) => {
      const res = await apiRequest("PATCH", `/api/watchlist/${id}`, {
        ticker: data.ticker.toUpperCase().trim(),
        sector: data.sector,
        buy_below: data.buy_below ? parseFloat(data.buy_below) : null,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setEditingId(null);
      toast({ title: "Watchlist item updated" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: "Removed from watchlist" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker) return;
    createMutation.mutate(form);
  };

  const handleEdit = (item: WatchlistItem) => {
    setEditingId(item.id);
    setEditForm({
      ticker: item.ticker,
      sector: item.sector,
      buy_below: item.buy_below != null ? String(item.buy_below) : "",
      notes: item.notes,
    });
  };

  const handleEditSave = (id: number) => {
    editMutation.mutate({ id, data: editForm });
  };

  const sorted = useMemo(
    () => [...watchlist].sort((a, b) => a.ticker.localeCompare(b.ticker)),
    [watchlist]
  );

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Watchlist
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stocks you're watching — set your buy-below price
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="gap-1.5"
          data-testid="button-add-watchlist"
        >
          <Plus className="h-3.5 w-3.5" />
          Add to Watchlist
        </Button>
      </div>

      {/* S&P 500 filter info card */}
      <div className="rounded-lg border border-border bg-card/50 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-foreground mb-0.5">S&P 500 Candidate Filter</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The S&P 500 requires profitability (4 consecutive quarters of positive earnings), market
            cap &gt;$20B, and 50% public float. Add companies you believe will qualify.
          </p>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            New Watchlist Item
          </h2>
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Ticker
              </label>
              <Input
                value={form.ticker}
                onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="e.g. MSFT"
                className="h-8 text-xs font-mono"
                data-testid="input-wl-ticker"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Sector
              </label>
              <Input
                value={form.sector}
                onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
                placeholder="e.g. Technology"
                className="h-8 text-xs"
                data-testid="input-wl-sector"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Buy Below ($, optional)
              </label>
              <Input
                type="number"
                step="0.01"
                value={form.buy_below}
                onChange={(e) => setForm((f) => ({ ...f, buy_below: e.target.value }))}
                placeholder="e.g. 350.00"
                className="h-8 text-xs font-mono"
                data-testid="input-wl-buyblow"
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
                  placeholder="e.g. Wait for dip"
                  className="h-8 text-xs flex-1"
                  data-testid="input-wl-notes"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!form.ticker || createMutation.isPending}
                  className="h-8 px-3 shrink-0"
                  data-testid="button-create-wl"
                >
                  Add
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Watchlist */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Eye className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Your watchlist is empty</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add stocks you're monitoring with buy-below price targets
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-3 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Watchlist Items ({sorted.length})
            </h2>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[80px_100px_1fr_100px_120px] gap-2 px-3 py-2 border-b border-border/50 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            <span>Ticker</span>
            <span>Sector</span>
            <span>Notes</span>
            <span className="text-right">Buy Below</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y divide-border/50">
            {sorted.map((item) =>
              editingId === item.id ? (
                // Inline edit row
                <div
                  key={item.id}
                  className="px-3 py-2 bg-muted/30 space-y-2"
                  data-testid={`row-wl-edit-${item.id}`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <Input
                      value={editForm.ticker}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))
                      }
                      placeholder="Ticker"
                      className="h-7 text-xs font-mono"
                      data-testid="input-wl-edit-ticker"
                    />
                    <Input
                      value={editForm.sector}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, sector: e.target.value }))
                      }
                      placeholder="Sector"
                      className="h-7 text-xs"
                      data-testid="input-wl-edit-sector"
                    />
                    <Input
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      placeholder="Notes"
                      className="h-7 text-xs"
                      data-testid="input-wl-edit-notes"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={editForm.buy_below}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, buy_below: e.target.value }))
                      }
                      placeholder="Buy Below"
                      className="h-7 text-xs font-mono"
                      data-testid="input-wl-edit-buyblow"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleEditSave(item.id)}
                      disabled={editMutation.isPending}
                      className="h-7 text-xs gap-1"
                      data-testid={`button-wl-save-${item.id}`}
                    >
                      <Check className="w-3 h-3" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                      className="h-7 text-xs gap-1"
                      data-testid={`button-wl-cancel-${item.id}`}
                    >
                      <X className="w-3 h-3" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                // Normal row
                <div
                  key={item.id}
                  className="grid grid-cols-[80px_100px_1fr_100px_120px] gap-2 items-center px-3 py-2.5 hover:bg-muted/20 transition-colors"
                  data-testid={`row-wl-${item.id}`}
                >
                  <span className="font-mono font-bold text-sm text-foreground">{item.ticker}</span>
                  <span className="text-xs text-muted-foreground truncate">{item.sector || "—"}</span>
                  <span className="text-xs text-muted-foreground truncate">{item.notes || "—"}</span>
                  <span className="text-right font-mono text-xs text-primary">
                    {item.buy_below != null ? `$${item.buy_below.toFixed(2)}` : "—"}
                  </span>
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-1.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                      data-testid={`button-wl-edit-${item.id}`}
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(item.id)}
                      className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                      data-testid={`button-wl-delete-${item.id}`}
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

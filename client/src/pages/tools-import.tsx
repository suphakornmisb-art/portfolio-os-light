import { useState, useRef } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Camera,
  Upload,
  Loader2,
  Check,
  Plus,
  X,
  ImagePlus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  LayoutList,
  Receipt,
  ArrowRight,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExtractedHolding {
  ticker: string;
  shares: number;
  avg_cost: number;
}

interface DiffItem {
  ticker: string;
  action: "create" | "update";
  existing_shares: number;
  new_shares: number;
  existing_avg_cost: number;
  new_avg_cost: number;
  added_shares: number;
  added_cost: number;
  notes: string;
  existing_id: number | null;
  selected: boolean;
}

interface MissingItem {
  ticker: string;
  action: "delete";
  existing_shares: number;
  existing_avg_cost: number;
  existing_id: number;
  notes: string;
  selected: boolean;
}

type Mode = "portfolio" | "transaction";
type Stage = "pick-mode" | "collecting" | "extracting" | "review" | "applying" | "done";

// ── Component ────────────────────────────────────────────────────────────────

export default function ToolsImport() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode | null>(null);
  const [stage, setStage] = useState<Stage>("pick-mode");

  // Accumulated extracted holdings across batches (portfolio mode)
  const [accumulated, setAccumulated] = useState<ExtractedHolding[]>([]);
  const [batchCount, setBatchCount] = useState(0);

  // Current batch images waiting to be sent
  const [images, setImages] = useState<{ data: string; mimeType: string; name: string }[]>([]);

  // Diff results
  const [diff, setDiff] = useState<DiffItem[]>([]);
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ── Helpers ──

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newImages: typeof images = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const data = await fileToBase64(file);
      newImages.push({ data, mimeType: file.type, name: file.name });
    }
    setImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  // Deduplicated count of unique tickers in accumulated
  const uniqueTickers = new Set(accumulated.filter((h) => h.shares > 0 && h.avg_cost > 0).map((h) => h.ticker));

  // ── Extract batch ──

  const extractBatch = useMutation({
    mutationFn: async () => {
      setError(null);
      setStage("extracting");
      const res = await apiRequest("POST", "/api/holdings/extract-screenshots", {
        images: images.map((img) => ({ data: img.data, mimeType: img.mimeType })),
        mode: mode!,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const extracted: ExtractedHolding[] = data.holdings || [];
      const usable = extracted.filter((h) => h.shares > 0 && h.avg_cost > 0);

      if (usable.length === 0 && extracted.length === 0) {
        setError("Could not extract any holdings from these screenshots. Try clearer images.");
        setStage("collecting");
        return;
      }

      // Merge into accumulated (newer overrides older for same ticker)
      setAccumulated((prev) => {
        const map = new Map<string, ExtractedHolding>();
        for (const h of prev) map.set(h.ticker, h);
        for (const h of extracted) {
          if (h.shares > 0 && h.avg_cost > 0) map.set(h.ticker, h);
        }
        return Array.from(map.values());
      });

      setBatchCount((c) => c + 1);
      setImages([]);

      const newUsable = usable.length;
      toast({
        title: `Batch extracted`,
        description: `${newUsable} holding(s) found in ${images.length} image(s)`,
      });

      if (mode === "transaction") {
        // Transaction mode: go straight to diff after extract
        buildDiff(extracted);
      } else {
        setStage("collecting");
      }
    },
    onError: (err: any) => {
      setError(err.message || "Extraction failed");
      setStage("collecting");
    },
  });

  // ── Build diff (for review) ──

  const buildDiff = async (holdings?: ExtractedHolding[]) => {
    try {
      setError(null);
      setStage("extracting"); // reuse spinner
      const payload = holdings || accumulated;
      const res = await apiRequest("POST", "/api/holdings/diff-import", {
        holdings: payload,
        mode: mode!,
      });
      const data = await res.json();

      setDiff((data.diff || []).map((d: any) => ({ ...d, selected: d.notes !== "No change" })));
      setMissing((data.missing || []).map((m: any) => ({ ...m, selected: false })));
      setStage("review");
    } catch (err: any) {
      setError(err.message || "Failed to build diff");
      setStage("collecting");
    }
  };

  // ── Apply ──

  const applyMutation = useMutation({
    mutationFn: async () => {
      setStage("applying");
      const changes = diff.filter((d) => d.selected);
      const deletions = missing.filter((m) => m.selected).map((m) => ({ existing_id: m.existing_id }));
      const res = await apiRequest("POST", "/api/holdings/apply-import", { changes, deletions });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.applied} change(s) applied` });
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prices"] });
      setStage("done");
    },
    onError: (err: any) => {
      setError(err.message || "Apply failed");
      setStage("review");
    },
  });

  const toggleDiff = (idx: number) => setDiff((prev) => prev.map((d, i) => (i === idx ? { ...d, selected: !d.selected } : d)));
  const toggleMissing = (idx: number) => setMissing((prev) => prev.map((m, i) => (i === idx ? { ...m, selected: !m.selected } : m)));

  const selectedChanges = diff.filter((d) => d.selected).length;
  const selectedDeletions = missing.filter((m) => m.selected).length;
  const changedItems = diff.filter((d) => d.notes !== "No change");
  const unchangedItems = diff.filter((d) => d.notes === "No change");

  const reset = () => {
    setMode(null);
    setStage("pick-mode");
    setAccumulated([]);
    setBatchCount(0);
    setImages([]);
    setDiff([]);
    setMissing([]);
    setError(null);
  };

  // ── Render ──

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/tools">
          <button className="p-1.5 rounded-md hover:bg-muted transition-colors" data-testid="button-back-tools">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Screenshot Import
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Import holdings from Dime! screenshots
          </p>
        </div>
      </div>

      {/* ── Pick Mode ── */}
      {stage === "pick-mode" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Choose import type</p>
          <button
            className="w-full rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors text-left group"
            onClick={() => { setMode("portfolio"); setStage("collecting"); }}
            data-testid="button-mode-portfolio"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 shrink-0">
                <LayoutList className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Portfolio Sync</h2>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Upload "My Assets" screenshots in batches. Scroll through your portfolio, screenshot each holding's expanded details, upload a few at a time. When done, review the full diff and apply once.
                </p>
              </div>
            </div>
          </button>
          <button
            className="w-full rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors text-left group"
            onClick={() => { setMode("transaction"); setStage("collecting"); }}
            data-testid="button-mode-transaction"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 shrink-0">
                <Receipt className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Transaction Import</h2>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Upload order confirmation screenshots. Each buy gets merged into your existing holdings.
                </p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ── Collecting (upload batches) ── */}
      {(stage === "collecting" || stage === "extracting") && (
        <div className="space-y-4">
          {/* Progress bar for portfolio mode */}
          {mode === "portfolio" && (
            <div className="rounded-lg border border-border bg-card/50 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-foreground">
                  {uniqueTickers.size} unique holding(s) collected
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {batchCount} batch(es) processed
                </span>
              </div>
              {/* Show collected tickers */}
              {uniqueTickers.size > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Array.from(uniqueTickers).sort().map((t) => (
                    <span key={t} className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Drop zone */}
          <div
            className="rounded-lg border-2 border-dashed border-border hover:border-primary/40 bg-card p-6 text-center transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
            data-testid="dropzone-import"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); if (e.target) e.target.value = ""; }}
            />
            <ImagePlus className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">
              {mode === "portfolio" ? "Add next batch of screenshots" : "Select order screenshots"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "portfolio"
                ? "Upload a few at a time — keep adding until you've covered all holdings"
                : "One order confirmation per image"}
            </p>
          </div>

          {/* Queued images */}
          {images.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {images.length} image(s) ready to scan
                </span>
                <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} className="h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Add more
                </Button>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {images.map((img, i) => (
                  <div key={i} className="relative group rounded-md overflow-hidden border border-border bg-muted aspect-[3/4]">
                    <img src={`data:${img.mimeType};base64,${img.data}`} alt={img.name} className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 hover:bg-red-500 transition-colors"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {images.length > 0 && (
              <Button
                onClick={() => extractBatch.mutate()}
                disabled={stage === "extracting"}
                className="flex-1 gap-2"
                data-testid="button-extract-batch"
              >
                {stage === "extracting" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Scan {images.length} Image(s)</>
                )}
              </Button>
            )}
            {mode === "portfolio" && uniqueTickers.size > 0 && images.length === 0 && stage !== "extracting" && (
              <Button
                onClick={() => buildDiff()}
                className="flex-1 gap-2"
                data-testid="button-review-diff"
              >
                <Check className="w-4 h-4" />
                Done — Review {uniqueTickers.size} Holdings
              </Button>
            )}
          </div>

          {/* Back to mode picker */}
          {stage === "collecting" && batchCount === 0 && images.length === 0 && (
            <Button variant="ghost" size="sm" onClick={reset} className="text-xs text-muted-foreground gap-1">
              <ArrowLeft className="w-3 h-3" /> Change mode
            </Button>
          )}
        </div>
      )}

      {/* ── Review Diff ── */}
      {stage === "review" && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-lg border border-border bg-card/50 p-3 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {changedItems.length} change(s)
              {unchangedItems.length > 0 && <>, {unchangedItems.length} unchanged</>}
              {missing.length > 0 && <>, {missing.length} not in screenshots</>}
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {selectedChanges + selectedDeletions} selected
            </Badge>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Changed items */}
          {changedItems.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Changes</span>
              {changedItems.map((d) => {
                const realIdx = diff.indexOf(d);
                return (
                  <div
                    key={d.ticker}
                    className={`rounded-lg border bg-card p-3 transition-colors cursor-pointer ${
                      d.selected ? "border-primary/40" : "border-border opacity-50"
                    }`}
                    onClick={() => toggleDiff(realIdx)}
                    data-testid={`card-import-${d.ticker}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${
                          d.selected ? "bg-primary border-primary" : "border-muted-foreground"
                        }`}>
                          {d.selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <span className="font-mono font-bold text-sm">{d.ticker}</span>
                        <Badge variant="outline" className={`text-[10px] ${
                          d.action === "create" ? "text-emerald-400 border-emerald-500/30"
                            : d.notes === "Transaction merge" ? "text-blue-400 border-blue-500/30"
                            : "text-amber-400 border-amber-500/30"
                        }`}>
                          {d.action === "create" ? "New" : d.notes === "Transaction merge" ? "Merge" : "Sync"}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground">Shares</span>
                        <div className="font-mono">
                          {d.action === "update" ? (
                            <><span className="text-muted-foreground">{d.existing_shares.toFixed(4)}</span>
                            <span className="text-foreground"> → {d.new_shares.toFixed(4)}</span></>
                          ) : (
                            <span className="text-emerald-400">{d.new_shares.toFixed(4)}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground">Avg Cost</span>
                        <div className="font-mono">
                          {d.action === "update" ? (
                            <><span className="text-muted-foreground">${d.existing_avg_cost.toFixed(2)}</span>
                            <span className="text-foreground"> → ${d.new_avg_cost.toFixed(2)}</span></>
                          ) : (
                            <span className="text-foreground">${d.new_avg_cost.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Missing items (portfolio mode only) */}
          {missing.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider flex items-center gap-1">
                <Trash2 className="w-3 h-3" />
                Not found in screenshots — remove?
              </span>
              <p className="text-[10px] text-muted-foreground">
                These holdings are in your portfolio but weren't in any screenshot. Select to remove if you've sold them.
              </p>
              {missing.map((m, i) => (
                <div
                  key={m.ticker}
                  className={`rounded-lg border bg-card p-3 transition-colors cursor-pointer ${
                    m.selected ? "border-red-500/40" : "border-border opacity-60"
                  }`}
                  onClick={() => toggleMissing(i)}
                  data-testid={`card-missing-${m.ticker}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${
                      m.selected ? "bg-red-500 border-red-500" : "border-muted-foreground"
                    }`}>
                      {m.selected && <X className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className="font-mono font-bold text-sm">{m.ticker}</span>
                    <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30">Remove</Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {m.existing_shares.toFixed(4)} @ ${m.existing_avg_cost.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Unchanged (collapsed) */}
          {unchangedItems.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                No change ({unchangedItems.length})
              </span>
              <div className="rounded-lg border border-border bg-card/30 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {unchangedItems.map((d) => (
                    <span key={d.ticker} className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                      {d.ticker}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setStage("collecting"); setDiff([]); setMissing([]); }} className="flex-1 gap-1.5" data-testid="button-back-collecting">
              <ArrowLeft className="w-3.5 h-3.5" />
              Add More
            </Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={selectedChanges + selectedDeletions === 0}
              className="flex-1 gap-1.5"
              data-testid="button-apply-import"
            >
              <Check className="w-3.5 h-3.5" />
              Apply {selectedChanges + selectedDeletions}
            </Button>
          </div>
        </div>
      )}

      {/* ── Applying ── */}
      {stage === "applying" && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Saving changes...</p>
        </div>
      )}

      {/* ── Done ── */}
      {stage === "done" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="text-sm font-medium text-foreground">Import complete</p>
          <p className="text-xs text-muted-foreground">Your holdings have been updated.</p>
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
              <Camera className="w-3.5 h-3.5" /> Import More
            </Button>
            <Link href="/">
              <Button size="sm" className="gap-1.5">View Portfolio</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

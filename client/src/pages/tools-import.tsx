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
  ArrowRightLeft,
  AlertCircle,
} from "lucide-react";

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

export default function ToolsImport() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // State machine: idle → extracting → preview → applying → done
  const [stage, setStage] = useState<"idle" | "extracting" | "preview" | "applying" | "done">("idle");
  const [images, setImages] = useState<{ data: string; mimeType: string; name: string }[]>([]);
  const [diff, setDiff] = useState<DiffItem[]>([]);
  const [extractInfo, setExtractInfo] = useState<{ extracted: number; usable: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

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

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // Extract from screenshots
  const extractMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      setStage("extracting");
      const res = await apiRequest("POST", "/api/holdings/import-screenshot", {
        images: images.map((img) => ({ data: img.data, mimeType: img.mimeType })),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (!data.diff || data.diff.length === 0) {
        setError("Could not extract any holdings from the screenshots. Try clearer images or make sure the expanded details (shares, cost) are visible.");
        setStage("idle");
        return;
      }
      setExtractInfo({ extracted: data.extracted_count || 0, usable: data.usable_count || 0 });
      // Auto-deselect "No change" items, select everything else
      setDiff(data.diff.map((d: any) => ({ ...d, selected: d.notes !== "No change" })));
      setStage("preview");
    },
    onError: (err: any) => {
      setError(err.message || "Extraction failed");
      setStage("idle");
    },
  });

  // Apply selected changes
  const applyMutation = useMutation({
    mutationFn: async () => {
      setStage("applying");
      const selected = diff.filter((d) => d.selected);
      const res = await apiRequest("POST", "/api/holdings/apply-import", { changes: selected });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.length} holding(s) updated` });
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prices"] });
      setStage("done");
    },
    onError: (err: any) => {
      setError(err.message || "Apply failed");
      setStage("preview");
    },
  });

  const toggleItem = (idx: number) => {
    setDiff((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, selected: !d.selected } : d)),
    );
  };

  const selectAll = () => setDiff((prev) => prev.map((d) => ({ ...d, selected: true })));
  const deselectAll = () => setDiff((prev) => prev.map((d) => ({ ...d, selected: false })));

  const selectedCount = diff.filter((d) => d.selected).length;
  const changedCount = diff.filter((d) => d.notes !== "No change").length;

  const reset = () => {
    setStage("idle");
    setImages([]);
    setDiff([]);
    setExtractInfo(null);
    setError(null);
  };

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
            Upload Dime! screenshots to import or sync your holdings
          </p>
        </div>
      </div>

      {/* Stage: Idle — upload images */}
      {(stage === "idle" || stage === "extracting") && (
        <div className="space-y-4">
          {/* Instructions */}
          <div className="rounded-lg border border-border bg-card/50 p-3.5 space-y-2">
            <p className="text-xs font-medium text-foreground">Supported screenshots</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <span>
                  <span className="text-foreground font-medium">Portfolio view</span> — Dime! "My Assets" screenshots with expanded details (shares + cost visible)
                </span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <span>
                  <span className="text-foreground font-medium">Order confirmation</span> — Individual buy/sell order screenshots
                </span>
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            className="rounded-lg border-2 border-dashed border-border hover:border-primary/40 bg-card p-8 text-center transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
            onDragOver={(e) => e.preventDefault()}
            data-testid="dropzone-import"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <ImagePlus className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Tap to select screenshots</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload multiple screenshots at once — each will be scanned for holdings
            </p>
          </div>

          {/* Image preview thumbnails */}
          {images.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{images.length} image(s) selected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add more
                </Button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-border bg-muted aspect-[3/4]">
                    <img
                      src={`data:${img.mimeType};base64,${img.data}`}
                      alt={img.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-red-500 transition-colors"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
                      <span className="text-[9px] text-white truncate block">{img.name}</span>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              <Button
                onClick={() => extractMutation.mutate()}
                disabled={stage === "extracting"}
                className="w-full gap-2"
                data-testid="button-extract"
              >
                {stage === "extracting" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scanning {images.length} image(s)...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Extract Holdings
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Stage: Preview — diff table */}
      {stage === "preview" && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="rounded-lg border border-border bg-card/50 p-3 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {extractInfo && (
                <span>Extracted {extractInfo.extracted} holdings, {extractInfo.usable} with complete data</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="text-[10px] text-primary hover:underline">Select all</button>
              <span className="text-muted-foreground/30">|</span>
              <button onClick={deselectAll} className="text-[10px] text-muted-foreground hover:underline">Deselect all</button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Review {diff.length} holding(s)
            </span>
            <Badge variant="outline" className="text-xs font-mono">
              {selectedCount} selected
            </Badge>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Changed items */}
          {changedCount > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Changes</span>
              {diff.filter((d) => d.notes !== "No change").map((d, i) => {
                const realIdx = diff.indexOf(d);
                return (
                  <div
                    key={d.ticker}
                    className={`rounded-lg border bg-card p-3.5 transition-colors cursor-pointer ${
                      d.selected ? "border-primary/40" : "border-border opacity-50"
                    }`}
                    onClick={() => toggleItem(realIdx)}
                    data-testid={`card-import-${d.ticker}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                            d.selected
                              ? "bg-primary border-primary"
                              : "border-muted-foreground"
                          }`}
                        >
                          {d.selected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <span className="font-mono font-bold text-sm">{d.ticker}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            d.action === "create"
                              ? "text-emerald-400 border-emerald-500/30"
                              : "text-blue-400 border-blue-500/30"
                          }`}
                        >
                          {d.action === "create" ? "New" : d.notes === "Transaction merge" ? "Merge" : "Sync"}
                        </Badge>
                      </div>
                      {d.notes && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                          {d.notes}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground">Shares</span>
                        <div className="font-mono">
                          {d.action === "update" ? (
                            <span>
                              <span className="text-muted-foreground">{d.existing_shares.toFixed(4)}</span>
                              <span className="text-foreground"> → {d.new_shares.toFixed(4)}</span>
                            </span>
                          ) : (
                            <span className="text-emerald-400">{d.new_shares.toFixed(4)}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground">Avg Cost</span>
                        <div className="font-mono">
                          {d.action === "update" ? (
                            <span>
                              <span className="text-muted-foreground">${d.existing_avg_cost.toFixed(2)}</span>
                              <span className="text-foreground"> → ${d.new_avg_cost.toFixed(2)}</span>
                            </span>
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

          {/* Unchanged items (collapsed) */}
          {diff.filter((d) => d.notes === "No change").length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                No change ({diff.filter((d) => d.notes === "No change").length})
              </span>
              <div className="rounded-lg border border-border bg-card/30 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {diff.filter((d) => d.notes === "No change").map((d) => (
                    <span key={d.ticker} className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                      {d.ticker}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} className="flex-1 gap-1.5" data-testid="button-cancel-import">
              <X className="w-3.5 h-3.5" />
              Cancel
            </Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={selectedCount === 0}
              className="flex-1 gap-1.5"
              data-testid="button-apply-import"
            >
              <Check className="w-3.5 h-3.5" />
              Apply {selectedCount} Change(s)
            </Button>
          </div>
        </div>
      )}

      {/* Stage: Applying */}
      {stage === "applying" && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Saving changes...</p>
        </div>
      )}

      {/* Stage: Done */}
      {stage === "done" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="text-sm font-medium text-foreground">Import complete</p>
          <p className="text-xs text-muted-foreground">
            Your holdings have been updated.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              Import More
            </Button>
            <Link href="/">
              <Button size="sm" className="gap-1.5">
                View Portfolio
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

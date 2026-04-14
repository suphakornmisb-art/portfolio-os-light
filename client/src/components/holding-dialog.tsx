import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Holding } from "@shared/schema";

const formSchema = z.object({
  ticker: z.string().min(1, "Ticker required").toUpperCase(),
  bdd_type: z.enum(["engine", "grounder", "builder", "moonshot"]),
  shares: z.coerce.number().positive("Must be positive"),
  avg_cost: z.coerce.number().positive("Must be positive"),
  sector: z.string().default(""),
  notes: z.string().default(""),
});

type FormValues = z.infer<typeof formSchema>;

interface HoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: Holding | null;
  onSave: (data: FormValues) => void;
}

export function HoldingDialog({ open, onOpenChange, holding, onSave }: HoldingDialogProps) {
  const isEdit = !!holding;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ticker: "",
      bdd_type: "engine",
      shares: 0,
      avg_cost: 0,
      sector: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (holding) {
        form.reset({
          ticker: holding.ticker,
          bdd_type: holding.bdd_type as any,
          shares: holding.shares,
          avg_cost: holding.avg_cost,
          sector: holding.sector,
          notes: holding.notes,
        });
      } else {
        form.reset({
          ticker: "",
          bdd_type: "engine",
          shares: 0,
          avg_cost: 0,
          sector: "",
          notes: "",
        });
      }
    }
  }, [open, holding, form]);

  const onSubmit = (data: FormValues) => {
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {isEdit ? `Edit ${holding?.ticker}` : "Add Holding"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="ticker"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Ticker</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isEdit}
                      placeholder="AAPL"
                      className="h-8 text-xs font-mono bg-muted/50"
                      data-testid="input-ticker"
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bdd_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">BDD Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-bdd-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="engine">Engine</SelectItem>
                      <SelectItem value="grounder">Grounder</SelectItem>
                      <SelectItem value="builder">Builder</SelectItem>
                      <SelectItem value="moonshot">Moonshot</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="shares"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Shares</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="any"
                        className="h-8 text-xs font-mono bg-muted/50"
                        data-testid="input-shares"
                      />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="avg_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Avg Cost USD</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="any"
                        className="h-8 text-xs font-mono bg-muted/50"
                        data-testid="input-avg-cost"
                      />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="sector"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Sector</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Information Technology"
                      className="h-8 text-xs bg-muted/50"
                      data-testid="input-sector"
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Investment thesis..."
                      rows={2}
                      className="text-xs bg-muted/50 resize-none"
                      data-testid="input-notes"
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" data-testid="button-save">
                {isEdit ? "Update" : "Add"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

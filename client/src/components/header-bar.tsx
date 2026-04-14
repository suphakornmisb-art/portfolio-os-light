import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, CalendarDays } from "lucide-react";

function Logo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      aria-label="InvestingOS Logo"
      className="shrink-0"
    >
      <rect x="3" y="18" width="5" height="11" rx="1.5" fill="#3b82f6" opacity="0.8" />
      <rect x="10" y="12" width="5" height="17" rx="1.5" fill="#10b981" opacity="0.8" />
      <rect x="17" y="8" width="5" height="21" rx="1.5" fill="#f59e0b" opacity="0.8" />
      <rect x="24" y="3" width="5" height="26" rx="1.5" fill="#a855f7" opacity="0.8" />
      <path
        d="M5 17 L12 11 L19 7 L26 3"
        stroke="#0cd4a0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="5" cy="17" r="2" fill="#0cd4a0" />
      <circle cx="12" cy="11" r="2" fill="#0cd4a0" />
      <circle cx="19" cy="7" r="2" fill="#0cd4a0" />
      <circle cx="26" cy="3" r="2" fill="#0cd4a0" />
    </svg>
  );
}

interface HeaderBarProps {
  onRefresh: () => void;
  onAdd: () => void;
  isLoading: boolean;
  onTodayClick?: () => void;
}

export function HeaderBar({ onRefresh, onAdd, isLoading, onTodayClick }: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground" data-testid="text-brand">
              InvestingOS
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-subtitle">
              Portfolio OS Light
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onTodayClick && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTodayClick}
              data-testid="button-today"
              className="gap-1.5"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Today</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            data-testid="button-refresh"
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            size="sm"
            onClick={onAdd}
            data-testid="button-add"
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

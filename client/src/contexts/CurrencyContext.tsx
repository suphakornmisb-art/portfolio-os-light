import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtCurrency } from "@/components/format";

type Currency = "USD" | "THB";

interface ExchangeRateData {
  rate: number;
  pair: string;
  cached_at: string;
}

interface CurrencyContextValue {
  currency: Currency;
  rate: number;
  symbol: "$" | "฿";
  toggle: () => void;
  convert: (usdAmount: number) => number;
  formatAmount: (usdAmount: number, compact?: boolean) => string;
  rateData: ExchangeRateData | null;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  rate: 1,
  symbol: "$",
  toggle: () => {},
  convert: (v) => v,
  formatAmount: (v, c) => fmtCurrency(v, "USD", c),
  rateData: null,
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("USD");

  // Only fetch exchange rate when THB is selected
  const { data: rateData } = useQuery<ExchangeRateData>({
    queryKey: ["/api/exchange-rate"],
    enabled: currency === "THB",
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const rate = currency === "THB" ? (rateData?.rate ?? 33.5) : 1;

  const toggle = useCallback(() => {
    setCurrency((c) => (c === "USD" ? "THB" : "USD"));
  }, []);

  const convert = useCallback(
    (usdAmount: number) => usdAmount * rate,
    [rate],
  );

  const formatAmount = useCallback(
    (usdAmount: number, compact = false) => {
      const converted = usdAmount * rate;
      return fmtCurrency(converted, currency, compact);
    },
    [currency, rate],
  );

  const symbol: "$" | "฿" = currency === "THB" ? "฿" : "$";

  return (
    <CurrencyContext.Provider
      value={{ currency, rate, symbol, toggle, convert, formatAmount, rateData: rateData ?? null }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

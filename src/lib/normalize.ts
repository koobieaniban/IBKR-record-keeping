import type { NormalizedFill, NormalizedSecType } from "./matching";
import type { FlexTrade } from "./flex";

export interface RawApiTrade {
  trade_id: string;
  symbol: string;
  company_name?: string;
  sec_type: string;
  currency: string;
  side: string;
  size: number;
  price: number;
  commission: number;
  net_amount: number;
  realized_pnl: number;
  trade_time: string;
  order_id: number | string;
  exchange?: string;
}

function mapSecType(s: string): NormalizedSecType {
  if (s === "STK") return "STK";
  if (s === "OPT" || s === "FOP") return "OPT";
  if (s === "CASH") return "CASH";
  return "OTHER";
}

/** Normalizes fills from get_account_trades (the plain IBKR trades API). This source has no
 * strike/expiry/putCall/conid, so every option fill on the same underlying collapses to one
 * contract key in the matching engine — see contractKey() in matching.ts. */
export function normalizeFromTradesApi(trades: RawApiTrade[]): NormalizedFill[] {
  return trades.map((t) => ({
    id: t.trade_id,
    source: "IBKR_TRADES_API" as const,
    conid: null,
    symbol: t.symbol,
    secType: mapSecType(t.sec_type),
    putCall: null,
    strike: null,
    expiry: null,
    side: t.side.toUpperCase() === "BUY" ? ("BUY" as const) : ("SELL" as const),
    quantity: Math.abs(t.size),
    price: t.price,
    commission: Math.abs(t.commission),
    netAmount: t.net_amount,
    realizedPnl: t.realized_pnl,
    tradeTime: new Date(t.trade_time),
    orderId: String(t.order_id),
    raw: t,
  }));
}

function parseFlexExpiry(expiry: string | null): Date | null {
  if (!expiry || expiry.length !== 8) return null;
  const year = Number(expiry.slice(0, 4));
  const month = Number(expiry.slice(4, 6));
  const day = Number(expiry.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

function parseFlexTradeTime(tradeDate: string, tradeTime: string | null): Date {
  const year = Number(tradeDate.slice(0, 4));
  const month = Number(tradeDate.slice(4, 6));
  const day = Number(tradeDate.slice(6, 8));
  const hh = tradeTime ? Number(tradeTime.slice(0, 2)) : 0;
  const mm = tradeTime ? Number(tradeTime.slice(2, 4)) : 0;
  const ss = tradeTime ? Number(tradeTime.slice(4, 6)) : 0;
  // Flex trade times are reported in the account's local/exchange time, not UTC. Treating
  // them as UTC here is a known simplification tracked for follow-up once we validate a real
  // Flex payload's timezone against the account's configured reporting timezone.
  return new Date(Date.UTC(year, month - 1, day, hh, mm, ss));
}

/** Normalizes fills from an IBKR Flex "Trades" report, which carries full contract detail. */
export function normalizeFromFlex(trades: FlexTrade[]): NormalizedFill[] {
  return trades.map((t) => ({
    id: t.tradeId,
    source: "IBKR_FLEX" as const,
    conid: t.conid,
    symbol: t.underlyingSymbol ?? t.symbol,
    secType: mapSecType(t.assetCategory),
    putCall: t.putCall,
    strike: t.strike,
    expiry: parseFlexExpiry(t.expiry),
    side: t.buySell === "BUY" ? ("BUY" as const) : ("SELL" as const),
    quantity: Math.abs(t.quantity),
    price: t.tradePrice,
    commission: Math.abs(t.ibCommission),
    netAmount: t.netCash,
    realizedPnl: t.fifoPnlRealized,
    tradeTime: parseFlexTradeTime(t.tradeDate, t.tradeTime),
    orderId: t.orderId,
    raw: t.raw,
  }));
}

import { easternTradingDate } from "./marketDate";

export type NormalizedSecType = "STK" | "OPT" | "CASH" | "OTHER";

export interface NormalizedFill {
  id: string;
  source: "IBKR_TRADES_API" | "IBKR_FLEX";
  conid: number | null;
  symbol: string; // underlying, e.g. "SPX", "NVDA"
  secType: NormalizedSecType;
  putCall: "P" | "C" | null;
  strike: number | null;
  expiry: Date | null;
  side: "BUY" | "SELL";
  quantity: number; // unsigned
  price: number;
  commission: number; // unsigned
  netAmount: number;
  realizedPnl: number; // as reported by IBKR for this fill, unprorated
  tradeTime: Date;
  orderId: string;
  raw: unknown;
}

interface OpenLot {
  quantity: number; // signed: +long, -short
  price: number;
  time: Date;
  fillIds: string[];
  commission: number; // commission still attributable to the remaining quantity in this lot
}

export interface RoundTrip {
  contractKey: string;
  symbol: string;
  secType: NormalizedSecType;
  putCall: "P" | "C" | null;
  strike: number | null;
  expiry: Date | null;
  conid: number | null;
  quantity: number; // unsigned matched quantity
  entryPrice: number;
  exitPrice: number;
  entryTime: Date;
  exitTime: Date;
  realizedPnl: number; // prorated share of the closing fill(s)' realizedPnl
  commission: number; // prorated share of opening + closing commission
  openFillIds: string[];
  closeFillIds: string[];
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** Identifies a specific tradable contract. Falls back to symbol+secType+trading-day when the
 * fill source (the plain IBKR trades API) doesn't carry strike/expiry/putCall/conid — in that
 * case all options on the same underlying on the same day collapse to a single contract key.
 * The trading-day is included in the fallback specifically because 0DTE SPX-style options
 * (same-day expiry) are the dominant case without Flex: it keeps one day's fills from being
 * FIFO-matched against a different day's, at the cost of still not distinguishing distinct
 * strikes within that day — a known limitation documented to the user pending Flex Web
 * Service integration, which supplies a real conid and removes the fallback entirely.
 */
export function contractKey(
  f: Pick<NormalizedFill, "conid" | "symbol" | "secType" | "strike" | "putCall" | "expiry" | "tradeTime">,
): string {
  if (f.conid) return `conid:${f.conid}`;
  const expiry = f.expiry ? f.expiry.toISOString().slice(0, 10) : "";
  const day = f.secType === "OPT" ? easternTradingDate(f.tradeTime) : "";
  return `sym:${f.symbol}|${f.secType}|${f.strike ?? ""}|${f.putCall ?? ""}|${expiry}|${day}`;
}

/** FIFO-matches a single contract's fills (already sorted by tradeTime ascending) into
 * round trips. Handles partial fills, scaling in/out, and a close that flips the position
 * to the opposite side (the leftover becomes a new open lot). */
export function fifoMatchContract(fills: NormalizedFill[]): RoundTrip[] {
  const lots: OpenLot[] = [];
  const roundTrips: RoundTrip[] = [];
  if (fills.length === 0) return roundTrips;
  const meta = fills[0];

  for (const fill of fills) {
    let remaining = fill.side === "BUY" ? fill.quantity : -fill.quantity;
    const commissionPerUnit = fill.quantity !== 0 ? fill.commission / fill.quantity : 0;
    const netPosition = lots.reduce((s, l) => s + l.quantity, 0);

    // Same direction as existing position (or flat): this fill only opens/extends, no match.
    if (netPosition === 0 || sign(netPosition) === sign(remaining)) {
      lots.push({
        quantity: remaining,
        price: fill.price,
        time: fill.tradeTime,
        fillIds: [fill.id],
        commission: commissionPerUnit * Math.abs(remaining),
      });
      continue;
    }

    // Opposite direction: consume opposing lots FIFO.
    while (remaining !== 0 && lots.length > 0 && sign(lots[0].quantity) !== sign(remaining)) {
      const lot = lots[0];
      const matchQty = Math.min(Math.abs(lot.quantity), Math.abs(remaining));
      const fraction = matchQty / fill.quantity;
      const lotUnitCommission = lot.commission / Math.abs(lot.quantity);
      const openCommissionShare = lotUnitCommission * matchQty;
      const closeCommissionShare = commissionPerUnit * matchQty;

      roundTrips.push({
        contractKey: contractKey(meta),
        symbol: meta.symbol,
        secType: meta.secType,
        putCall: meta.putCall,
        strike: meta.strike,
        expiry: meta.expiry,
        conid: meta.conid,
        quantity: matchQty,
        entryPrice: lot.price,
        exitPrice: fill.price,
        entryTime: lot.time,
        exitTime: fill.tradeTime,
        realizedPnl: fill.realizedPnl * fraction,
        commission: openCommissionShare + closeCommissionShare,
        openFillIds: [...lot.fillIds],
        closeFillIds: [fill.id],
      });

      lot.commission -= openCommissionShare;
      lot.quantity -= sign(lot.quantity) * matchQty;
      remaining -= sign(remaining) * matchQty;
      if (lot.quantity === 0) lots.shift();
    }

    if (remaining !== 0) {
      // Fully consumed opposing lots with quantity left over: flips into a new position.
      lots.push({
        quantity: remaining,
        price: fill.price,
        time: fill.tradeTime,
        fillIds: [fill.id],
        commission: commissionPerUnit * Math.abs(remaining),
      });
    }
  }

  return roundTrips;
}

export interface TradeDraftLeg {
  contractKey: string;
  conid: number | null;
  contractDesc: string;
  putCall: "P" | "C" | null;
  strike: number | null;
  expiry: Date | null;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: Date;
  exitTime: Date;
  realizedPnl: number;
  commission: number;
  fillIds: string[];
}

export type TradeCategory = "STOCK" | "OPTION" | "FOREX";

export interface TradeDraft {
  category: TradeCategory;
  ticker: string;
  tradeDate: string; // YYYY-MM-DD, Eastern trading day
  entryPrice: number; // net credit/debit or per-share price
  exitPrice: number;
  quantity: number;
  realizedPnl: number;
  commission: number;
  legs: TradeDraftLeg[];
}

function describeLeg(leg: Pick<RoundTrip, "strike" | "putCall" | "expiry">, symbol: string): string {
  if (leg.strike !== null && leg.putCall) {
    const exp = leg.expiry ? leg.expiry.toISOString().slice(0, 10) : "?";
    return `${symbol} ${exp} ${leg.strike} ${leg.putCall === "P" ? "PUT" : "CALL"}`;
  }
  return symbol;
}

/**
 * Groups normalized fills into trade drafts:
 * - CASH fills become their own FOREX trades, one per fill (conversions aren't matched).
 * - STK fills are FIFO-matched per symbol; each round trip is its own STOCK trade.
 * - OPT fills are FIFO-matched per contract, then grouped into one OPTION trade per
 *   (underlying, opening trading day) — matching multi-leg strategies (e.g. an iron
 *   condor) into a single record by default. Users can re-split/merge in the review UI.
 */
export function buildTradeDrafts(fills: NormalizedFill[]): TradeDraft[] {
  const drafts: TradeDraft[] = [];

  const byContract = new Map<string, NormalizedFill[]>();
  const cashFills: NormalizedFill[] = [];

  for (const fill of fills) {
    if (fill.secType === "CASH") {
      cashFills.push(fill);
      continue;
    }
    const key = contractKey(fill);
    const arr = byContract.get(key) ?? [];
    arr.push(fill);
    byContract.set(key, arr);
  }

  for (const fill of cashFills) {
    drafts.push({
      category: "FOREX",
      ticker: fill.symbol,
      tradeDate: easternTradingDate(fill.tradeTime),
      entryPrice: fill.price,
      exitPrice: fill.price,
      quantity: fill.quantity,
      realizedPnl: fill.realizedPnl,
      commission: fill.commission,
      legs: [
        {
          contractKey: contractKey(fill),
          conid: fill.conid,
          contractDesc: fill.symbol,
          putCall: null,
          strike: null,
          expiry: null,
          quantity: fill.quantity,
          entryPrice: fill.price,
          exitPrice: fill.price,
          entryTime: fill.tradeTime,
          exitTime: fill.tradeTime,
          realizedPnl: fill.realizedPnl,
          commission: fill.commission,
          fillIds: [fill.id],
        },
      ],
    });
  }

  // symbol -> secType -> round trips, so stock and option round trips can be grouped separately
  const stockRoundTrips: RoundTrip[] = [];
  const optionRoundTripsBySymbol = new Map<string, RoundTrip[]>();

  for (const [, contractFills] of byContract) {
    const sorted = [...contractFills].sort((a, b) => a.tradeTime.getTime() - b.tradeTime.getTime());
    const roundTrips = fifoMatchContract(sorted);
    for (const rt of roundTrips) {
      if (rt.secType === "STK") {
        stockRoundTrips.push(rt);
      } else {
        const arr = optionRoundTripsBySymbol.get(rt.symbol) ?? [];
        arr.push(rt);
        optionRoundTripsBySymbol.set(rt.symbol, arr);
      }
    }
  }

  for (const rt of stockRoundTrips) {
    drafts.push({
      category: "STOCK",
      ticker: rt.symbol,
      tradeDate: easternTradingDate(rt.entryTime),
      entryPrice: rt.entryPrice,
      exitPrice: rt.exitPrice,
      quantity: rt.quantity,
      realizedPnl: rt.realizedPnl,
      commission: rt.commission,
      legs: [
        {
          contractKey: rt.contractKey,
          conid: rt.conid,
          contractDesc: rt.symbol,
          putCall: null,
          strike: null,
          expiry: null,
          quantity: rt.quantity,
          entryPrice: rt.entryPrice,
          exitPrice: rt.exitPrice,
          entryTime: rt.entryTime,
          exitTime: rt.exitTime,
          realizedPnl: rt.realizedPnl,
          commission: rt.commission,
          fillIds: [...rt.openFillIds, ...rt.closeFillIds],
        },
      ],
    });
  }

  for (const [symbol, roundTrips] of optionRoundTripsBySymbol) {
    const byDay = new Map<string, RoundTrip[]>();
    for (const rt of roundTrips) {
      const day = easternTradingDate(rt.entryTime);
      const arr = byDay.get(day) ?? [];
      arr.push(rt);
      byDay.set(day, arr);
    }
    for (const [day, dayRoundTrips] of byDay) {
      const legs: TradeDraftLeg[] = dayRoundTrips.map((rt) => ({
        contractKey: rt.contractKey,
        conid: rt.conid,
        contractDesc: describeLeg(rt, symbol),
        putCall: rt.putCall,
        strike: rt.strike,
        expiry: rt.expiry,
        quantity: rt.quantity,
        entryPrice: rt.entryPrice,
        exitPrice: rt.exitPrice,
        entryTime: rt.entryTime,
        exitTime: rt.exitTime,
        realizedPnl: rt.realizedPnl,
        commission: rt.commission,
        fillIds: [...rt.openFillIds, ...rt.closeFillIds],
      }));
      const netEntry = legs.reduce((s, l) => s + l.entryPrice * l.quantity, 0);
      const netExit = legs.reduce((s, l) => s + l.exitPrice * l.quantity, 0);
      const totalQty = legs.reduce((s, l) => s + l.quantity, 0);
      drafts.push({
        category: "OPTION",
        ticker: symbol,
        tradeDate: day,
        entryPrice: netEntry,
        exitPrice: netExit,
        quantity: totalQty,
        realizedPnl: legs.reduce((s, l) => s + l.realizedPnl, 0),
        commission: legs.reduce((s, l) => s + l.commission, 0),
        legs,
      });
    }
  }

  return drafts;
}

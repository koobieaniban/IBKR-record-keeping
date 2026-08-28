import { XMLParser } from "fast-xml-parser";

const SEND_REQUEST_URL =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";

const GENERATING_ERROR_CODES = new Set(["1019", "1018"]);
const MAX_POLL_ATTEMPTS = 8;
const POLL_DELAY_MS = 5000;

export interface FlexTrade {
  tradeId: string;
  conid: number | null;
  symbol: string;
  underlyingSymbol: string | null;
  description: string | null;
  assetCategory: string; // STK, OPT, CASH, ...
  putCall: "P" | "C" | null;
  strike: number | null;
  expiry: string | null; // yyyymmdd, as reported
  multiplier: number | null;
  currency: string;
  buySell: string; // BUY / SELL
  quantity: number;
  tradePrice: number;
  ibCommission: number;
  netCash: number;
  fifoPnlRealized: number;
  tradeDate: string; // yyyymmdd
  tradeTime: string | null; // HHmmss
  exchange: string | null;
  orderId: string;
  raw: Record<string, unknown>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(v: unknown): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetches a Flex Query report's raw XML. IBKR's Flex Web Service is a two-step,
 * eventually-consistent API: SendRequest kicks off report generation and returns a reference
 * code; GetStatement then has to be polled (the report often isn't ready on the first call)
 * until the XML comes back. The query can include multiple sections (Trades, Open Positions,
 * ...) in one report — callers parse whichever sections they need from the same XML rather
 * than issuing a separate request per section, since each request counts against the token's
 * rate limit.
 */
export async function fetchFlexReportXml(token: string, queryId: string): Promise<string> {
  const sendUrl = `${SEND_REQUEST_URL}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
  const sendRes = await fetch(sendUrl);
  const sendXml = await sendRes.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const sendParsed = parser.parse(sendXml);
  const sendBody = sendParsed?.FlexStatementResponse;
  if (!sendBody) {
    throw new Error(`Unexpected Flex SendRequest response: ${sendXml.slice(0, 500)}`);
  }
  if (sendBody.Status !== "Success") {
    throw new Error(
      `Flex SendRequest failed: ${sendBody.ErrorCode ?? "?"} ${sendBody.ErrorMessage ?? sendXml.slice(0, 500)}`,
    );
  }
  const referenceCode = String(sendBody.ReferenceCode);
  const getUrl = String(sendBody.Url);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(POLL_DELAY_MS);
    const statementUrl = `${getUrl}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`;
    const res = await fetch(statementUrl);
    const xml = await res.text();

    // A still-generating response comes back as a FlexStatementResponse error envelope;
    // a ready report comes back as <FlexQueryResponse>...
    if (xml.includes("<FlexStatementResponse")) {
      const parsed = parser.parse(xml);
      const body = parsed?.FlexStatementResponse;
      const errorCode = body?.ErrorCode ? String(body.ErrorCode) : null;
      if (errorCode && GENERATING_ERROR_CODES.has(errorCode)) {
        continue;
      }
      throw new Error(`Flex GetStatement failed: ${errorCode ?? "?"} ${body?.ErrorMessage ?? xml.slice(0, 500)}`);
    }

    return xml;
  }

  throw new Error("Flex report did not finish generating in time; try again shortly.");
}

/** Convenience wrapper: fetches the report and parses only the Trades section. */
export async function fetchFlexTrades(token: string, queryId: string): Promise<FlexTrade[]> {
  const xml = await fetchFlexReportXml(token, queryId);
  return parseFlexTradesXml(xml);
}

export function parseFlexTradesXml(xml: string): FlexTrade[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const parsed = parser.parse(xml);
  const statements = parsed?.FlexQueryResponse?.FlexStatements?.FlexStatement;
  if (!statements) return [];
  const statementList = Array.isArray(statements) ? statements : [statements];

  const trades: FlexTrade[] = [];
  for (const statement of statementList) {
    const rawTrades = statement?.Trades?.Trade;
    if (!rawTrades) continue;
    const list = Array.isArray(rawTrades) ? rawTrades : [rawTrades];
    for (const t of list) {
      const putCallRaw = t.putCall ? String(t.putCall).toUpperCase() : null;
      trades.push({
        tradeId: String(t.tradeID ?? t.transactionID ?? `${t.conid}-${t.tradeDate}-${t.tradeTime}`),
        conid: toNullableNumber(t.conid),
        symbol: String(t.underlyingSymbol || t.symbol || "").trim() || String(t.symbol ?? ""),
        underlyingSymbol: t.underlyingSymbol ? String(t.underlyingSymbol) : null,
        description: t.description ? String(t.description) : null,
        assetCategory: String(t.assetCategory ?? ""),
        putCall: putCallRaw === "P" || putCallRaw === "C" ? (putCallRaw as "P" | "C") : null,
        strike: toNullableNumber(t.strike),
        expiry: t.expiry ? String(t.expiry) : null,
        multiplier: toNullableNumber(t.multiplier),
        currency: String(t.currency ?? "USD"),
        buySell: String(t.buySell ?? "").toUpperCase(),
        quantity: toNumber(t.quantity),
        tradePrice: toNumber(t.tradePrice),
        ibCommission: Math.abs(toNumber(t.ibCommission)),
        netCash: toNumber(t.netCash),
        fifoPnlRealized: toNumber(t.fifoPnlRealized),
        tradeDate: String(t.tradeDate ?? ""),
        tradeTime: t.tradeTime ? String(t.tradeTime) : null,
        exchange: t.exchange ? String(t.exchange) : null,
        orderId: String(t.ibOrderID ?? t.orderID ?? ""),
        raw: t as Record<string, unknown>,
      });
    }
  }
  return trades;
}

export interface FlexOpenPosition {
  conid: number;
  symbol: string;
  underlyingSymbol: string | null;
  description: string | null;
  assetCategory: string; // STK, OPT, ...
  putCall: "P" | "C" | null;
  strike: number | null;
  expiry: string | null; // yyyymmdd, as reported
  currency: string;
  position: number; // signed: +long, -short
  markPrice: number;
  positionValue: number;
  costBasisPrice: number; // avg cost per unit
  fifoPnlUnrealized: number;
  raw: Record<string, unknown>;
}

/** Parses the Open Positions section of a Flex report — a point-in-time snapshot (as of
 * report generation), not a history. Reflects whatever the query's date/time was generated. */
export function parseFlexOpenPositionsXml(xml: string): FlexOpenPosition[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const parsed = parser.parse(xml);
  const statements = parsed?.FlexQueryResponse?.FlexStatements?.FlexStatement;
  if (!statements) return [];
  const statementList = Array.isArray(statements) ? statements : [statements];

  const positions: FlexOpenPosition[] = [];
  for (const statement of statementList) {
    const rawPositions = statement?.OpenPositions?.OpenPosition;
    if (!rawPositions) continue;
    const list = Array.isArray(rawPositions) ? rawPositions : [rawPositions];
    for (const p of list) {
      const putCallRaw = p.putCall ? String(p.putCall).toUpperCase() : null;
      const conid = toNullableNumber(p.conid);
      if (conid === null) continue;
      positions.push({
        conid,
        symbol: String(p.underlyingSymbol || p.symbol || "").trim() || String(p.symbol ?? ""),
        underlyingSymbol: p.underlyingSymbol ? String(p.underlyingSymbol) : null,
        description: p.description ? String(p.description) : null,
        assetCategory: String(p.assetCategory ?? ""),
        putCall: putCallRaw === "P" || putCallRaw === "C" ? (putCallRaw as "P" | "C") : null,
        strike: toNullableNumber(p.strike),
        expiry: p.expiry ? String(p.expiry) : null,
        currency: String(p.currency ?? "USD"),
        position: toNumber(p.position),
        markPrice: toNumber(p.markPrice),
        positionValue: toNumber(p.positionValue),
        costBasisPrice: toNumber(p.costBasisPrice),
        fifoPnlUnrealized: toNumber(p.fifoPnlUnrealized),
        raw: p as Record<string, unknown>,
      });
    }
  }
  return positions;
}

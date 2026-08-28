import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { buildTradeDrafts, contractKey, type NormalizedFill, type TradeDraft } from "./matching";

export interface IngestResult {
  fillsIngested: number;
  tradesCreated: number;
  tradesSkippedAlreadyApproved: number;
}

/**
 * Ingests a batch of fills and rebuilds the set of PENDING trades from scratch every run.
 *
 * Why rebuild instead of incrementally patch: FIFO matching can split a single opening fill's
 * quantity across several round trips over time (e.g. a 3-lot buy closed by three separate
 * sells on three different days). RawFill.legId is single-valued, so there's no correct way
 * to represent "this fill is 1/3 assigned to leg A and 2/3 to leg B" — any incremental-merge
 * design that links a fill to "the" leg it belongs to breaks the moment a fill's quantity
 * needs to span multiple legs. Rebuilding sidesteps this entirely: every run recomputes FIFO
 * over the complete fill history, and a draft is only materialized as a new PENDING trade if
 * it doesn't exactly reconstruct fills already locked into an APPROVED trade. APPROVED trades
 * are the only durable, user-confirmed state — everything PENDING is disposable by design,
 * since the user hasn't reviewed it yet.
 */
export async function ingestFills(prisma: PrismaClient, fills: NormalizedFill[]): Promise<IngestResult> {
  const existingIds = new Set(
    (
      await prisma.rawFill.findMany({
        where: { id: { in: fills.map((f) => f.id) } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );
  const newFills = fills.filter((f) => !existingIds.has(f.id));

  if (newFills.length > 0) {
    await prisma.rawFill.createMany({
      data: newFills.map((f) => ({
        id: f.id,
        source: f.source,
        contractKey: contractKey(f),
        conid: f.conid,
        symbol: f.symbol,
        secType: f.secType,
        putCall: f.putCall,
        strike: f.strike,
        expiry: f.expiry,
        currency: "USD",
        side: f.side,
        size: f.quantity,
        price: f.price,
        commission: f.commission,
        netAmount: f.netAmount,
        realizedPnl: f.realizedPnl,
        tradeTime: f.tradeTime,
        orderId: f.orderId,
        raw: f.raw as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  }

  // Wipe the pending slate: delete every PENDING trade (cascades to its legs, which via
  // onDelete: SetNull frees up the fills that were only ever provisionally linked to them).
  await prisma.trade.deleteMany({ where: { status: "PENDING" } });

  // What remains linked now is exclusively fills locked into APPROVED trades.
  const allFills = await prisma.rawFill.findMany({ orderBy: { tradeTime: "asc" } });
  const lockedFillIds = new Set(allFills.filter((f) => f.legId !== null).map((f) => f.id));

  const normalized: NormalizedFill[] = allFills.map((f) => ({
    id: f.id,
    source: f.source as NormalizedFill["source"],
    conid: f.conid,
    symbol: f.symbol,
    secType: f.secType as NormalizedFill["secType"],
    putCall: f.putCall as NormalizedFill["putCall"],
    strike: f.strike,
    expiry: f.expiry,
    side: f.side as NormalizedFill["side"],
    quantity: f.size,
    price: f.price,
    commission: f.commission,
    netAmount: f.netAmount,
    realizedPnl: f.realizedPnl,
    tradeTime: f.tradeTime,
    orderId: f.orderId,
    raw: f.raw,
  }));

  const drafts = buildTradeDrafts(normalized);

  let tradesCreated = 0;
  let tradesSkippedAlreadyApproved = 0;

  for (const draft of drafts) {
    const allLegsLocked = draft.legs.every((leg) => leg.fillIds.every((id) => lockedFillIds.has(id)));
    if (allLegsLocked) {
      tradesSkippedAlreadyApproved++;
      continue;
    }

    await createDraftAsPendingTrade(prisma, draft);
    tradesCreated++;
  }

  return { fillsIngested: newFills.length, tradesCreated, tradesSkippedAlreadyApproved };
}

async function createDraftAsPendingTrade(prisma: PrismaClient, draft: TradeDraft) {
  const trade = await prisma.trade.create({
    data: {
      category: draft.category,
      ticker: draft.ticker,
      tradeDate: new Date(`${draft.tradeDate}T00:00:00Z`),
      entryPrice: draft.entryPrice,
      exitPrice: draft.exitPrice,
      quantity: draft.quantity,
      realizedPnl: draft.realizedPnl,
      commission: draft.commission,
      status: "PENDING",
    },
  });
  for (const leg of draft.legs) {
    const created = await prisma.tradeLeg.create({
      data: {
        tradeId: trade.id,
        conid: leg.conid,
        contractDesc: leg.contractDesc,
        putCall: leg.putCall,
        strike: leg.strike,
        expiry: leg.expiry,
        quantity: leg.quantity,
        entryPrice: leg.entryPrice,
        exitPrice: leg.exitPrice,
        entryTime: leg.entryTime,
        exitTime: leg.exitTime,
        realizedPnl: leg.realizedPnl,
        commission: leg.commission,
      },
    });
    await prisma.rawFill.updateMany({ where: { id: { in: leg.fillIds } }, data: { legId: created.id } });
  }
}

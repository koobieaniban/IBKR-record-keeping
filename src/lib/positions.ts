import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { FlexOpenPosition } from "./flex";

function parseFlexExpiry(expiry: string | null): Date | null {
  if (!expiry || expiry.length !== 8) return null;
  const year = Number(expiry.slice(0, 4));
  const month = Number(expiry.slice(4, 6));
  const day = Number(expiry.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

/** Flex's Open Positions report reports at lot level — a contract with several partial fills
 * (or a stale/short-then-long history) shows up as multiple rows sharing the same conid, not
 * one row per position. Collapse those into a single row per conid before writing: quantity,
 * position value, and unrealized P&L are naturally additive across lots; cost basis is a
 * quantity-weighted average; mark price is the same across a conid's lots at a given report
 * timestamp, so any one of them is fine. */
function collapseToOnePerConid(positions: FlexOpenPosition[]): FlexOpenPosition[] {
  const byConid = new Map<number, FlexOpenPosition[]>();
  for (const p of positions) {
    const arr = byConid.get(p.conid) ?? [];
    arr.push(p);
    byConid.set(p.conid, arr);
  }

  const collapsed: FlexOpenPosition[] = [];
  for (const lots of byConid.values()) {
    if (lots.length === 1) {
      collapsed.push(lots[0]);
      continue;
    }
    const totalQuantity = lots.reduce((s, l) => s + l.position, 0);
    const weightSum = lots.reduce((s, l) => s + Math.abs(l.position), 0);
    const weightedCostBasis =
      weightSum > 0 ? lots.reduce((s, l) => s + l.costBasisPrice * Math.abs(l.position), 0) / weightSum : lots[0].costBasisPrice;
    collapsed.push({
      ...lots[0],
      position: totalQuantity,
      positionValue: lots.reduce((s, l) => s + l.positionValue, 0),
      fifoPnlUnrealized: lots.reduce((s, l) => s + l.fifoPnlUnrealized, 0),
      costBasisPrice: weightedCostBasis,
    });
  }
  return collapsed;
}

/** Replaces the entire OpenPosition snapshot with the latest Flex report. This is a
 * point-in-time view (as of report generation), not a history, so there's nothing to
 * incrementally merge — positions that closed since the last run should simply disappear. */
export async function syncOpenPositions(prisma: PrismaClient, positions: FlexOpenPosition[]): Promise<number> {
  const asOf = new Date();
  const collapsed = collapseToOnePerConid(positions);
  await prisma.$transaction([
    prisma.openPosition.deleteMany({}),
    prisma.openPosition.createMany({
      data: collapsed.map((p) => ({
        conid: p.conid,
        symbol: p.symbol,
        description: p.description,
        secType: p.assetCategory,
        putCall: p.putCall,
        strike: p.strike,
        expiry: parseFlexExpiry(p.expiry),
        currency: p.currency,
        quantity: p.position,
        markPrice: p.markPrice,
        positionValue: p.positionValue,
        costBasisPrice: p.costBasisPrice,
        unrealizedPnl: p.fifoPnlUnrealized,
        asOf,
      })) satisfies Prisma.OpenPositionCreateManyInput[],
    }),
  ]);
  return collapsed.length;
}

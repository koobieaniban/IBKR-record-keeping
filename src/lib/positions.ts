import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { FlexOpenPosition } from "./flex";

function parseFlexExpiry(expiry: string | null): Date | null {
  if (!expiry || expiry.length !== 8) return null;
  const year = Number(expiry.slice(0, 4));
  const month = Number(expiry.slice(4, 6));
  const day = Number(expiry.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

/** Replaces the entire OpenPosition snapshot with the latest Flex report. This is a
 * point-in-time view (as of report generation), not a history, so there's nothing to
 * incrementally merge — positions that closed since the last run should simply disappear. */
export async function syncOpenPositions(prisma: PrismaClient, positions: FlexOpenPosition[]): Promise<number> {
  const asOf = new Date();
  await prisma.$transaction([
    prisma.openPosition.deleteMany({}),
    prisma.openPosition.createMany({
      data: positions.map((p) => ({
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
  return positions.length;
}

import { prisma } from "./prisma";
import type { TradeCategory } from "@/generated/prisma/client";

export async function getPendingTrades() {
  return prisma.trade.findMany({
    where: { status: "PENDING" },
    include: { legs: { orderBy: { entryTime: "asc" } } },
    orderBy: [{ tradeDate: "desc" }, { createdAt: "asc" }],
  });
}

export interface TradeHistoryFilters {
  category?: TradeCategory;
  from?: Date;
  to?: Date;
}

export async function getApprovedTrades(filters: TradeHistoryFilters = {}) {
  return prisma.trade.findMany({
    where: {
      status: "APPROVED",
      category: filters.category,
      tradeDate: {
        gte: filters.from,
        lte: filters.to,
      },
    },
    include: { legs: { orderBy: { entryTime: "asc" } } },
    orderBy: [{ tradeDate: "desc" }, { createdAt: "asc" }],
  });
}

export async function getSummary() {
  const approved = await prisma.trade.findMany({
    where: { status: "APPROVED" },
    select: { category: true, tradeDate: true, realizedPnl: true, commission: true },
  });

  const byCategory = new Map<string, { pnl: number; wins: number; losses: number; count: number }>();
  const byDay = new Map<string, { pnl: number; count: number }>();

  for (const t of approved) {
    const pnl = (t.realizedPnl ?? 0) - (t.commission ?? 0);
    const cat = byCategory.get(t.category) ?? { pnl: 0, wins: 0, losses: 0, count: 0 };
    cat.pnl += pnl;
    cat.count += 1;
    if (pnl > 0) cat.wins += 1;
    else if (pnl < 0) cat.losses += 1;
    byCategory.set(t.category, cat);

    const dayKey = t.tradeDate.toISOString().slice(0, 10);
    const day = byDay.get(dayKey) ?? { pnl: 0, count: 0 };
    day.pnl += pnl;
    day.count += 1;
    byDay.set(dayKey, day);
  }

  const totalPnl = [...byCategory.values()].reduce((s, c) => s + c.pnl, 0);
  const totalCount = approved.length;
  const totalWins = [...byCategory.values()].reduce((s, c) => s + c.wins, 0);

  return {
    totalPnl,
    totalCount,
    winRate: totalCount > 0 ? totalWins / totalCount : 0,
    byCategory: [...byCategory.entries()].map(([category, stats]) => ({ category, ...stats })),
    byDay: [...byDay.entries()]
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

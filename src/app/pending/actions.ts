"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/** Re-reads the rest of a trade's own state from the DB rather than trusting anything the
 * client sends beyond the id — the client only gets to say *which* trade and what to change. */
async function requireTrade(id: string) {
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) throw new Error("Trade not found");
  return trade;
}

export async function updateComment(tradeId: string, comment: string) {
  await requireTrade(tradeId);
  await prisma.trade.update({ where: { id: tradeId }, data: { comment } });
  revalidatePath("/pending");
  revalidatePath("/trades");
}

export async function updateStrategyLabel(tradeId: string, strategyLabel: string) {
  await requireTrade(tradeId);
  await prisma.trade.update({ where: { id: tradeId }, data: { strategyLabel } });
  revalidatePath("/pending");
  revalidatePath("/trades");
}

export async function approveTrade(tradeId: string) {
  await requireTrade(tradeId);
  await prisma.trade.update({ where: { id: tradeId }, data: { status: "APPROVED" } });
  revalidatePath("/pending");
  revalidatePath("/trades");
  revalidatePath("/summary");
}

export async function unapproveTrade(tradeId: string) {
  await requireTrade(tradeId);
  await prisma.trade.update({ where: { id: tradeId }, data: { status: "PENDING" } });
  revalidatePath("/pending");
  revalidatePath("/trades");
  revalidatePath("/summary");
}

async function recomputeTradeAggregate(tradeId: string) {
  const legs = await prisma.tradeLeg.findMany({ where: { tradeId } });
  const entryPrice = legs.reduce((s, l) => s + (l.entryPrice ?? 0) * l.quantity, 0);
  const exitPrice = legs.reduce((s, l) => s + (l.exitPrice ?? 0) * l.quantity, 0);
  const quantity = legs.reduce((s, l) => s + l.quantity, 0);
  const realizedPnl = legs.reduce((s, l) => s + l.realizedPnl, 0);
  const commission = legs.reduce((s, l) => s + l.commission, 0);
  await prisma.trade.update({
    where: { id: tradeId },
    data: { entryPrice, exitPrice, quantity, realizedPnl, commission },
  });
}

/** Moves the given legs out of their current (pending) trade into a brand new pending trade.
 * Used when the auto-grouping merged legs that were actually two separate strategies. */
export async function splitLegsIntoNewTrade(sourceTradeId: string, legIds: string[]) {
  const source = await requireTrade(sourceTradeId);
  if (source.status !== "PENDING") throw new Error("Only pending trades can be split");
  if (legIds.length === 0) throw new Error("No legs selected");

  const remainingLegCount = await prisma.tradeLeg.count({ where: { tradeId: sourceTradeId } });
  if (remainingLegCount <= legIds.length) throw new Error("Cannot split all legs out of a trade");

  const newTrade = await prisma.trade.create({
    data: {
      category: source.category,
      ticker: source.ticker,
      tradeDate: source.tradeDate,
      entryPrice: 0,
      exitPrice: 0,
      quantity: 0,
      status: "PENDING",
    },
  });
  await prisma.tradeLeg.updateMany({ where: { id: { in: legIds } }, data: { tradeId: newTrade.id } });
  await recomputeTradeAggregate(newTrade.id);
  await recomputeTradeAggregate(sourceTradeId);
  revalidatePath("/pending");
}

/** Merges several pending trades (same category+ticker) into one, keeping the first as the
 * target. Used when the auto-grouping split legs that actually belong to one strategy. */
export async function mergeTrades(tradeIds: string[]) {
  if (tradeIds.length < 2) throw new Error("Select at least two trades to merge");
  const trades = await prisma.trade.findMany({ where: { id: { in: tradeIds } } });
  if (trades.some((t) => t.status !== "PENDING")) throw new Error("Only pending trades can be merged");
  if (new Set(trades.map((t) => t.category)).size > 1) throw new Error("Trades must share a category to merge");

  const [target, ...rest] = trades;
  await prisma.tradeLeg.updateMany({
    where: { tradeId: { in: rest.map((t) => t.id) } },
    data: { tradeId: target.id },
  });
  await prisma.trade.deleteMany({ where: { id: { in: rest.map((t) => t.id) } } });
  await recomputeTradeAggregate(target.id);
  revalidatePath("/pending");
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { approveTrade, mergeTrades, splitLegsIntoNewTrade, updateComment, updateStrategyLabel } from "./actions";
import { formatDate, formatMoney, formatTime } from "@/lib/format";

interface Leg {
  id: string;
  contractDesc: string;
  putCall: string | null;
  strike: number | null;
  quantity: number;
  entryPrice: number | null;
  exitPrice: number | null;
  entryTime: Date | null;
  exitTime: Date | null;
  realizedPnl: number;
  commission: number;
}

interface Trade {
  id: string;
  category: "STOCK" | "OPTION" | "FOREX";
  ticker: string;
  tradeDate: Date;
  strategyLabel: string | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  realizedPnl: number | null;
  commission: number | null;
  comment: string | null;
  legs: Leg[];
}

const CATEGORY_LABELS: Record<Trade["category"], string> = {
  STOCK: "Stocks",
  OPTION: "Options",
  FOREX: "Forex / Cash",
};

export function PendingBoard({ trades }: { trades: Trade[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const byCategory = useMemo(() => {
    const map = new Map<Trade["category"], Trade[]>();
    for (const t of trades) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return map;
  }, [trades]);

  const selectedTrades = trades.filter((t) => selected.has(t.id));
  const canMerge =
    selectedTrades.length >= 2 &&
    selectedTrades.every((t) => t.category === selectedTrades[0].category && t.ticker === selectedTrades[0].ticker);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (trades.length === 0) {
    return <p className="text-neutral-500">No pending trades to review. New captures will show up here.</p>;
  }

  return (
    <div className="space-y-8">
      {canMerge && (
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm dark:border-blue-800 dark:bg-blue-950">
          <span>
            {selectedTrades.length} trades selected ({selectedTrades[0].ticker})
          </span>
          <button
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
            onClick={() => {
              void mergeTrades([...selected]).then(() => setSelected(new Set()));
            }}
          >
            Merge into one trade
          </button>
        </div>
      )}
      {[...byCategory.entries()].map(([category, categoryTrades]) => (
        <section key={category}>
          <h2 className="mb-3 text-lg font-semibold">{CATEGORY_LABELS[category]}</h2>
          <div className="space-y-4">
            {categoryTrades.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                selected={selected.has(trade.id)}
                onToggleSelected={() => toggleSelected(trade.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TradeCard({ trade, selected, onToggleSelected }: { trade: Trade; selected: boolean; onToggleSelected: () => void }) {
  const [comment, setComment] = useState(trade.comment ?? "");
  const [strategyLabel, setStrategyLabel] = useState(trade.strategyLabel ?? "");
  const [checkedLegs, setCheckedLegs] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const netPnl = (trade.realizedPnl ?? 0) - (trade.commission ?? 0);
  const pnlColor = netPnl > 0 ? "text-green-600 dark:text-green-400" : netPnl < 0 ? "text-red-600 dark:text-red-400" : "";

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={selected} onChange={onToggleSelected} title="Select for merge" />
          <span className="font-semibold">{trade.ticker}</span>
          <span className="text-sm text-neutral-500">{formatDate(trade.tradeDate)}</span>
          <input
            className="rounded border border-neutral-300 bg-transparent px-2 py-0.5 text-sm dark:border-neutral-700"
            placeholder="Strategy label (e.g. Iron Condor)"
            value={strategyLabel}
            onChange={(e) => setStrategyLabel(e.target.value)}
            onBlur={() => startTransition(() => void updateStrategyLabel(trade.id, strategyLabel))}
          />
        </div>
        <div className="text-right">
          <div className={`font-mono ${pnlColor}`}>{formatMoney(netPnl)}</div>
          <div className="text-xs text-neutral-500">
            entry {formatMoney(trade.entryPrice)} &rarr; exit {trade.exitPrice !== null ? formatMoney(trade.exitPrice) : "open"} &times;{" "}
            {trade.quantity}
          </div>
        </div>
      </div>

      {trade.legs.length > 1 && (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="w-6"></th>
              <th>Leg</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {trade.legs.map((leg) => (
              <tr key={leg.id} className="border-t border-neutral-100 dark:border-neutral-900">
                <td>
                  <input
                    type="checkbox"
                    checked={checkedLegs.has(leg.id)}
                    onChange={() =>
                      setCheckedLegs((prev) => {
                        const next = new Set(prev);
                        if (next.has(leg.id)) next.delete(leg.id);
                        else next.add(leg.id);
                        return next;
                      })
                    }
                  />
                </td>
                <td>{leg.contractDesc}</td>
                <td>{leg.quantity}</td>
                <td>
                  {leg.entryPrice !== null ? formatMoney(leg.entryPrice) : "?"}
                  {leg.entryTime && <span className="ml-1 text-xs text-neutral-500">{formatTime(leg.entryTime)}</span>}
                </td>
                <td>
                  {leg.exitPrice !== null ? formatMoney(leg.exitPrice) : "?"}
                  {leg.exitTime && <span className="ml-1 text-xs text-neutral-500">{formatTime(leg.exitTime)}</span>}
                </td>
                <td className={leg.realizedPnl > 0 ? "text-green-600" : leg.realizedPnl < 0 ? "text-red-600" : ""}>
                  {formatMoney(leg.realizedPnl - leg.commission)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {trade.legs.length > 1 && checkedLegs.size > 0 && (
        <button
          className="mt-2 rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          onClick={() =>
            startTransition(() => void splitLegsIntoNewTrade(trade.id, [...checkedLegs]).then(() => setCheckedLegs(new Set())))
          }
        >
          Split {checkedLegs.size} leg(s) into new trade
        </button>
      )}

      <textarea
        className="mt-3 w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
        rows={2}
        placeholder="Why did this win or lose? What do you want to review?"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => startTransition(() => void updateComment(trade.id, comment))}
      />

      <div className="mt-2 flex justify-end">
        <button
          disabled={isPending}
          className="rounded bg-neutral-900 px-3 py-1 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          onClick={() => startTransition(() => void approveTrade(trade.id))}
        >
          Approve
        </button>
      </div>
    </div>
  );
}

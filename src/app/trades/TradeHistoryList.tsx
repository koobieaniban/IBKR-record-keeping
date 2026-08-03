"use client";

import { useState, useTransition } from "react";
import { unapproveTrade, updateComment } from "@/app/pending/actions";
import { formatDate, formatMoney } from "@/lib/format";

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
  legs: { id: string; contractDesc: string }[];
}

export function TradeHistoryList({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return <p className="text-neutral-500">No approved trades match these filters yet.</p>;
  }
  return (
    <div className="space-y-3">
      {trades.map((t) => (
        <TradeRow key={t.id} trade={t} />
      ))}
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const [comment, setComment] = useState(trade.comment ?? "");
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const netPnl = (trade.realizedPnl ?? 0) - (trade.commission ?? 0);
  const pnlColor = netPnl > 0 ? "text-green-600 dark:text-green-400" : netPnl < 0 ? "text-red-600 dark:text-red-400" : "";

  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          <span className="font-semibold">{trade.ticker}</span>{" "}
          <span className="text-neutral-500">{formatDate(trade.tradeDate)}</span>
          {trade.strategyLabel && <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">{trade.strategyLabel}</span>}
          {trade.legs.length > 1 && <span className="ml-2 text-xs text-neutral-500">{trade.legs.length} legs</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-neutral-500">
            {formatMoney(trade.entryPrice)} &rarr; {trade.exitPrice !== null ? formatMoney(trade.exitPrice) : "open"}
          </span>
          <span className={`font-mono ${pnlColor}`}>{formatMoney(netPnl)}</span>
          <button
            disabled={isPending}
            className="text-xs text-neutral-500 underline disabled:opacity-50"
            onClick={() => startTransition(() => void unapproveTrade(trade.id))}
          >
            Unapprove
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          autoFocus
          className="mt-2 w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => {
            setEditing(false);
            startTransition(() => void updateComment(trade.id, comment));
          }}
        />
      ) : (
        <button
          className="mt-1 block w-full rounded p-1 text-left text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-900"
          onClick={() => setEditing(true)}
        >
          {comment || <span className="italic text-neutral-400">Add a comment&hellip;</span>}
        </button>
      )}
    </div>
  );
}

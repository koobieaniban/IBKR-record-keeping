import Link from "next/link";
import { getApprovedTrades } from "@/lib/queries";
import { TradeHistoryList } from "./TradeHistoryList";
import type { TradeCategory } from "@/generated/prisma/client";

const CATEGORIES: TradeCategory[] = ["STOCK", "OPTION", "FOREX"];

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const category = CATEGORIES.includes(params.category as TradeCategory) ? (params.category as TradeCategory) : undefined;
  const from = params.from ? new Date(`${params.from}T00:00:00Z`) : undefined;
  const to = params.to ? new Date(`${params.to}T23:59:59Z`) : undefined;

  const trades = await getApprovedTrades({ category, from, to });

  function filterHref(nextCategory?: TradeCategory) {
    const qs = new URLSearchParams();
    if (nextCategory) qs.set("category", nextCategory);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const s = qs.toString();
    return s ? `/trades?${s}` : "/trades";
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Trade History</h1>
      <p className="mb-4 text-sm text-neutral-500">Approved trades, most recent first.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href={filterHref(undefined)} className={`rounded px-2 py-1 ${!category ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}>
          All
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={filterHref(c)}
            className={`rounded px-2 py-1 ${category === c ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}
          >
            {c === "STOCK" ? "Stocks" : c === "OPTION" ? "Options" : "Forex / Cash"}
          </Link>
        ))}
        <form className="ml-auto flex items-center gap-2">
          <input type="date" name="from" defaultValue={params.from} className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" />
          <span>&ndash;</span>
          <input type="date" name="to" defaultValue={params.to} className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" />
          {category && <input type="hidden" name="category" value={category} />}
          <button className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700">Apply</button>
        </form>
      </div>

      <TradeHistoryList trades={trades} />
    </div>
  );
}

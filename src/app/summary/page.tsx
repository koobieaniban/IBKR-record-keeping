import { getSummary } from "@/lib/queries";
import { formatMoney } from "@/lib/format";

// Reflects live trade data written by the ingest worker (a separate process),
// so it must never be statically generated / cached at build time.
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  STOCK: "Stocks",
  OPTION: "Options",
  FOREX: "Forex / Cash",
};

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "text-green-600 dark:text-green-400" : tone === "down" ? "text-red-600 dark:text-red-400" : "";
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold font-mono ${color}`}>{value}</div>
    </div>
  );
}

export default async function SummaryPage() {
  const summary = await getSummary();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Summary</h1>
      <p className="mb-6 text-sm text-neutral-500">Across all approved trades.</p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label="Net P&L" value={formatMoney(summary.totalPnl)} tone={summary.totalPnl >= 0 ? "up" : "down"} />
        <StatTile label="Trades" value={String(summary.totalCount)} />
        <StatTile label="Win rate" value={`${(summary.winRate * 100).toFixed(0)}%`} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">By category</h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Trades</th>
              <th className="px-3 py-2">Wins</th>
              <th className="px-3 py-2">Losses</th>
              <th className="px-3 py-2">Net P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {summary.byCategory.map((c) => (
              <tr key={c.category} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-3 py-2">{CATEGORY_LABELS[c.category] ?? c.category}</td>
                <td className="px-3 py-2">{c.count}</td>
                <td className="px-3 py-2 text-green-600 dark:text-green-400">{c.wins}</td>
                <td className="px-3 py-2 text-red-600 dark:text-red-400">{c.losses}</td>
                <td className={`px-3 py-2 font-mono ${c.pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {formatMoney(c.pnl)}
                </td>
              </tr>
            ))}
            {summary.byCategory.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-neutral-500">
                  No approved trades yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-semibold">By day</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Trades</th>
              <th className="px-3 py-2">Net P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {summary.byDay.map((d) => (
              <tr key={d.date} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-3 py-2">{d.date}</td>
                <td className="px-3 py-2">{d.count}</td>
                <td className={`px-3 py-2 font-mono ${d.pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {formatMoney(d.pnl)}
                </td>
              </tr>
            ))}
            {summary.byDay.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-neutral-500">
                  No approved trades yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

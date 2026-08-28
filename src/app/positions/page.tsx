import { getOpenPositions, getTodaysTrades } from "@/lib/queries";
import { formatDate, formatMoney, formatTime } from "@/lib/format";

// Reflects live trade/position data written by the ingest worker (a separate process),
// so it must never be statically generated / cached at build time.
export const dynamic = "force-dynamic";

function pnlColor(n: number): string {
  return n > 0 ? "text-green-600 dark:text-green-400" : n < 0 ? "text-red-600 dark:text-red-400" : "";
}

function describeExpiry(expiry: Date | null, strike: number | null, putCall: string | null): string | null {
  if (!expiry || strike === null || !putCall) return null;
  const exp = expiry.toISOString().slice(0, 10);
  return `${exp} ${strike} ${putCall === "P" ? "PUT" : "CALL"}`;
}

export default async function PositionsPage() {
  const [todaysTrades, openPositions] = await Promise.all([getTodaysTrades(), getOpenPositions()]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="mb-1 text-2xl font-bold">Today</h1>
        <p className="mb-6 text-sm text-neutral-500">What closed today, and what&rsquo;s still open, as of the last ingest run.</p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Today&rsquo;s Closed Trades</h2>
        {todaysTrades.length === 0 ? (
          <p className="text-neutral-500">Nothing closed today yet.</p>
        ) : (
          <div className="space-y-2">
            {todaysTrades.map((t) => {
              const netPnl = (t.realizedPnl ?? 0) - (t.commission ?? 0);
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                >
                  <div>
                    <span className="font-semibold">{t.ticker}</span>{" "}
                    <span className="text-neutral-500">{formatDate(t.tradeDate)}</span>
                    <span
                      className={`ml-2 rounded px-2 py-0.5 text-xs ${
                        t.status === "APPROVED"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                      }`}
                    >
                      {t.status === "APPROVED" ? "Approved" : "Pending review"}
                    </span>
                    {t.legs.length > 1 && <span className="ml-2 text-xs text-neutral-500">{t.legs.length} legs</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-neutral-500">
                      {formatMoney(t.entryPrice)} &rarr; {t.exitPrice !== null ? formatMoney(t.exitPrice) : "open"}
                    </span>
                    <span className={`font-mono ${pnlColor(netPnl)}`}>{formatMoney(netPnl)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Open Positions</h2>
        {openPositions.length === 0 ? (
          <p className="text-neutral-500">No open positions as of the last ingest run.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Contract</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Cost basis</th>
                  <th className="px-3 py-2">Mark</th>
                  <th className="px-3 py-2">Unrealized P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((p) => (
                  <tr key={p.conid} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-3 py-2 font-semibold">{p.symbol}</td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-500">
                      {describeExpiry(p.expiry, p.strike, p.putCall) ?? p.description ?? "—"}
                    </td>
                    <td className={`px-3 py-2 font-mono ${p.quantity < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                      {p.quantity > 0 ? "+" : ""}
                      {p.quantity}
                    </td>
                    <td className="px-3 py-2 font-mono">{formatMoney(p.costBasisPrice)}</td>
                    <td className="px-3 py-2 font-mono">{formatMoney(p.markPrice)}</td>
                    <td className={`px-3 py-2 font-mono ${pnlColor(p.unrealizedPnl)}`}>{formatMoney(p.unrealizedPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {openPositions.length > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            As of last ingest run: {formatDate(openPositions[0].asOf)} {formatTime(openPositions[0].asOf)}
          </p>
        )}
      </section>
    </div>
  );
}

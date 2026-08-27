import { getPendingTrades } from "@/lib/queries";
import { PendingBoard } from "./PendingBoard";

// Reflects live trade data written by the ingest worker (a separate process),
// so it must never be statically generated / cached at build time.
export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const trades = await getPendingTrades();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Pending Review</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Trades captured from IBKR, waiting for your review. Fix any leg grouping, add a comment, then approve.
      </p>
      <PendingBoard trades={trades} />
    </div>
  );
}

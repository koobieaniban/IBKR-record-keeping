import { getPendingTrades } from "@/lib/queries";
import { PendingBoard } from "./PendingBoard";

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

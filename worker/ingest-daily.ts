// Entrypoint for the Railway cron-scheduled ingestion service. Runs once per invocation:
// pulls the account's Flex "Trades" report, normalizes it, and rebuilds the pending trade
// queue. Scheduled to fire right at US market close (see railway.worker.json). Distinct from
// scripts/backfill-from-mcp-json.ts, which is a one-off historical loader using the plain
// trades API (no contract detail) — this worker is the ongoing, contract-detail-complete path.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchFlexTrades } from "../src/lib/flex";
import { normalizeFromFlex } from "../src/lib/normalize";
import { ingestFills } from "../src/lib/ingest";

async function main() {
  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) {
    throw new Error("IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID must be set");
  }

  console.log(`[${new Date().toISOString()}] Fetching Flex trades report...`);
  const flexTrades = await fetchFlexTrades(token, queryId);
  console.log(`Fetched ${flexTrades.length} trade rows from Flex.`);

  const fills = normalizeFromFlex(flexTrades);
  const result = await ingestFills(prisma, fills);
  console.log(result);
}

main()
  .catch((err) => {
    console.error("Daily ingestion failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

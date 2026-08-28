// Entrypoint for the Railway cron-scheduled ingestion service. Runs once per invocation:
// pulls the account's Flex "Trades" report, normalizes it, and rebuilds the pending trade
// queue. Scheduled to fire right at US market close (see railway.worker.json). Distinct from
// scripts/backfill-from-mcp-json.ts, which is a one-off historical loader using the plain
// trades API (no contract detail) — this worker is the ongoing, contract-detail-complete path.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchFlexReportXml, parseFlexTradesXml, parseFlexOpenPositionsXml } from "../src/lib/flex";
import { normalizeFromFlex } from "../src/lib/normalize";
import { ingestFills } from "../src/lib/ingest";
import { syncOpenPositions } from "../src/lib/positions";

async function main() {
  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) {
    throw new Error("IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID must be set");
  }

  // One report fetch, both sections parsed from the same XML — a second SendRequest just to
  // get positions would needlessly cost against the token's rate limit (see the ingest-worker
  // deploy history: a crash-restart loop once burned through it on repeated Flex calls).
  console.log(`[${new Date().toISOString()}] Fetching Flex report...`);
  const xml = await fetchFlexReportXml(token, queryId);

  const flexTrades = parseFlexTradesXml(xml);
  console.log(`Fetched ${flexTrades.length} trade rows from Flex.`);
  const fills = normalizeFromFlex(flexTrades);
  const result = await ingestFills(prisma, fills);
  console.log(result);

  const flexPositions = parseFlexOpenPositionsXml(xml);
  console.log(`Fetched ${flexPositions.length} open positions from Flex.`);
  const positionsSynced = await syncOpenPositions(prisma, flexPositions);
  console.log(`Synced ${positionsSynced} open positions.`);
}

main()
  .catch((err) => {
    console.error("Daily ingestion failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

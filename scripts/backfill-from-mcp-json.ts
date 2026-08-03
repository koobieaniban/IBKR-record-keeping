// Backfills the database from a raw get_account_trades JSON dump (the shape returned by the
// IBKR MCP tool: { trades: RawApiTrade[] }). Used for the initial historical load, since that
// tool is reachable today; ongoing daily ingestion once deployed will use the Flex worker
// instead (see worker/ingest-daily.ts), which carries full contract detail.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { normalizeFromTradesApi, type RawApiTrade } from "../src/lib/normalize";
import { ingestFills } from "../src/lib/ingest";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx scripts/backfill-from-mcp-json.ts <path-to-trades.json>");
    process.exit(1);
  }
  const json = JSON.parse(readFileSync(path, "utf-8")) as { trades: RawApiTrade[] };
  const fills = normalizeFromTradesApi(json.trades);
  console.log(`Loaded ${fills.length} fills from ${path}`);

  const result = await ingestFills(prisma, fills);
  console.log(result);

  const counts = await prisma.trade.groupBy({ by: ["category", "status"], _count: true });
  console.log(counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

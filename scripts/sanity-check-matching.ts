// One-off sanity check: runs the matching engine against a real slice of the user's July 31
// SPX 0DTE fills (pulled earlier via get_account_trades) to eyeball the grouping/FIFO output
// before wiring up the DB. Not a permanent script; safe to delete once the engine is trusted.
import { normalizeFromTradesApi, type RawApiTrade } from "../src/lib/normalize";
import { buildTradeDrafts } from "../src/lib/matching";

const sampleTrades: RawApiTrade[] = [
  { trade_id: "a", symbol: "SPX", sec_type: "OPT", currency: "USD", side: "SELL", size: 1, price: 1.5, commission: 1.63028, net_amount: 150, realized_pnl: 99.82944, trade_time: "2026-07-31T19:43:20Z", order_id: 278074787 },
  { trade_id: "b", symbol: "SPX", sec_type: "OPT", currency: "USD", side: "BUY", size: 1, price: 4, commission: 1.63028, net_amount: 400, realized_pnl: -251.26056, trade_time: "2026-07-31T19:38:26Z", order_id: 278074784 },
  { trade_id: "c", symbol: "SPX", sec_type: "OPT", currency: "USD", side: "SELL", size: 1, price: 1.52, commission: 1.63028, net_amount: 152, realized_pnl: 0, trade_time: "2026-07-31T19:10:48Z", order_id: 278074768 },
  { trade_id: "d", symbol: "SPX", sec_type: "OPT", currency: "USD", side: "BUY", size: 1, price: 0.82, commission: 1.54028, net_amount: 82, realized_pnl: 0, trade_time: "2026-07-31T19:10:48Z", order_id: 278074768 },
  { trade_id: "e", symbol: "SPX", sec_type: "OPT", currency: "USD", side: "BUY", size: 1, price: 0.47, commission: 1.54028, net_amount: 47, realized_pnl: 0, trade_time: "2026-07-31T19:10:48Z", order_id: 278074768 },
];

const fills = normalizeFromTradesApi(sampleTrades);
const drafts = buildTradeDrafts(fills);

console.log(JSON.stringify(drafts, null, 2));
console.log(`\n${drafts.length} trade draft(s) produced from ${sampleTrades.length} fills.`);

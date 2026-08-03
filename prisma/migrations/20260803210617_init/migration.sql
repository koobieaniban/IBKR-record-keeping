-- CreateEnum
CREATE TYPE "TradeCategory" AS ENUM ('STOCK', 'OPTION', 'FOREX');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateEnum
CREATE TYPE "FillSource" AS ENUM ('IBKR_TRADES_API', 'IBKR_FLEX');

-- CreateTable
CREATE TABLE "RawFill" (
    "id" TEXT NOT NULL,
    "source" "FillSource" NOT NULL,
    "contractKey" TEXT NOT NULL,
    "conid" INTEGER,
    "symbol" TEXT NOT NULL,
    "companyName" TEXT,
    "secType" TEXT NOT NULL,
    "putCall" TEXT,
    "strike" DOUBLE PRECISION,
    "expiry" TIMESTAMP(3),
    "multiplier" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "realizedPnl" DOUBLE PRECISION NOT NULL,
    "tradeTime" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "exchange" TEXT,
    "raw" JSONB NOT NULL,
    "legId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawFill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeLeg" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "conid" INTEGER,
    "contractDesc" TEXT NOT NULL,
    "putCall" TEXT,
    "strike" DOUBLE PRECISION,
    "expiry" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION,
    "exitPrice" DOUBLE PRECISION,
    "entryTime" TIMESTAMP(3),
    "exitTime" TIMESTAMP(3),
    "realizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "TradeLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "category" "TradeCategory" NOT NULL,
    "ticker" TEXT NOT NULL,
    "strategyLabel" TEXT,
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION NOT NULL,
    "realizedPnl" DOUBLE PRECISION,
    "commission" DOUBLE PRECISION,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawFill_contractKey_idx" ON "RawFill"("contractKey");

-- CreateIndex
CREATE INDEX "RawFill_legId_idx" ON "RawFill"("legId");

-- CreateIndex
CREATE INDEX "Trade_tradeDate_idx" ON "Trade"("tradeDate");

-- CreateIndex
CREATE INDEX "Trade_category_status_idx" ON "Trade"("category", "status");

-- AddForeignKey
ALTER TABLE "RawFill" ADD CONSTRAINT "RawFill_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TradeLeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeLeg" ADD CONSTRAINT "TradeLeg_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

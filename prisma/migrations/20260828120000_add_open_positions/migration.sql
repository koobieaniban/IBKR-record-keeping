-- CreateTable
CREATE TABLE "OpenPosition" (
    "conid" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT,
    "secType" TEXT NOT NULL,
    "putCall" TEXT,
    "strike" DOUBLE PRECISION,
    "expiry" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "markPrice" DOUBLE PRECISION NOT NULL,
    "positionValue" DOUBLE PRECISION NOT NULL,
    "costBasisPrice" DOUBLE PRECISION NOT NULL,
    "unrealizedPnl" DOUBLE PRECISION NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenPosition_pkey" PRIMARY KEY ("conid")
);

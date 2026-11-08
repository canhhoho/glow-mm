-- CreateTable
CREATE TABLE "appRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" BIGINT NOT NULL,

    CONSTRAINT "appRateLimit_pkey" PRIMARY KEY ("key")
);

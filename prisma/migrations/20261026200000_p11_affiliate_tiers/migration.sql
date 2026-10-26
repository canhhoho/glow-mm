-- CreateEnum
CREATE TYPE "AffiliateLineKind" AS ENUM ('SALE', 'UPLINE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "AffiliatePayoutLine" ADD COLUMN     "kind" "AffiliateLineKind" NOT NULL DEFAULT 'SALE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "uplineAffiliateId" TEXT,
ADD COLUMN     "uplineRateBp" INTEGER;

-- CreateTable
CREATE TABLE "AffiliateApplication" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "affiliateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateApplication_affiliateId_key" ON "AffiliateApplication"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateApplication_status_createdAt_idx" ON "AffiliateApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateApplication_inviterId_status_idx" ON "AffiliateApplication"("inviterId", "status");

-- CreateIndex
CREATE INDEX "Affiliate_parentId_idx" ON "Affiliate"("parentId");

-- CreateIndex
CREATE INDEX "Order_uplineAffiliateId_createdAt_idx" ON "Order"("uplineAffiliateId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_uplineAffiliateId_fkey" FOREIGN KEY ("uplineAffiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplication" ADD CONSTRAINT "AffiliateApplication_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplication" ADD CONSTRAINT "AffiliateApplication_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;


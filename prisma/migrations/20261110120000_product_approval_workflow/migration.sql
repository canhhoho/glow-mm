-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'REJECTED', 'APPROVED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "approvalVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstPublishedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- CreateTable
CREATE TABLE "ProductChangeRequest" (
    "productId" TEXT NOT NULL,
    "content" JSONB,
    "prices" JSONB,
    "images" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductChangeRequest_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE INDEX "Product_approvalStatus_archivedAt_idx" ON "Product"("approvalStatus", "archivedAt");

-- AddForeignKey
ALTER TABLE "ProductChangeRequest" ADD CONSTRAINT "ProductChangeRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── P1-A: chuyển đổi dữ liệu (chạy TRƯỚC khi thêm CHECK) ──

-- Q-A: SP đang đăng mà thiếu dấu duyệt → hệ thống duyệt bản đang hiển thị (để bản live được bảo vệ ngay); ghi vết.
INSERT INTO "AuditLog" ("id", "userId", "action", "entity", "entityId", "data", "createdAt")
SELECT gen_random_uuid()::text, NULL, 'product.approve.backfill', 'Product', p."id", jsonb_build_object('reason', 'published_without_approval'), now()
FROM "Product" p
WHERE p."published" AND p."approvedAt" IS NULL;

UPDATE "Product" SET "approvedAt" = now(), "approvedById" = NULL
WHERE "published" AND "approvedAt" IS NULL;

-- SP đã duyệt (không có bản đang sửa lúc chuyển đổi) → APPROVED; còn lại giữ DRAFT (gửi duyệt tay).
UPDATE "Product" SET "approvalStatus" = 'APPROVED' WHERE "approvedAt" IS NOT NULL;

-- Lần đăng đầu: nhật ký product.publish sớm nhất; SP đang đăng mà thiếu nhật ký → gần đúng bằng lúc duyệt / cập nhật.
UPDATE "Product" p SET "firstPublishedAt" = a."first"
FROM (SELECT "entityId", MIN("createdAt") AS "first" FROM "AuditLog" WHERE "action" = 'product.publish' AND "entityId" IS NOT NULL GROUP BY "entityId") a
WHERE a."entityId" = p."id";

UPDATE "Product" SET "firstPublishedAt" = COALESCE("approvedAt", "updatedAt")
WHERE "published" AND "firstPublishedAt" IS NULL;

-- ── Ràng buộc ──
ALTER TABLE "Product" ADD CONSTRAINT "Product_approval_status_requires_approval" CHECK ("approvalStatus" <> 'APPROVED' OR "approvedAt" IS NOT NULL);
ALTER TABLE "Product" ADD CONSTRAINT "Product_published_requires_approval" CHECK (NOT "published" OR "approvedAt" IS NOT NULL);

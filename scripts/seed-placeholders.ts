/**
 * Ảnh MINH HOẠ tự vẽ cho bản Preview (Vercel) — thay ảnh demo lengocanh.vn (có bản quyền, chỉ dùng local).
 * Chạy SAU `npm run db:seed` (+ `db:seed:demo -- --no-images` nếu muốn có ~45 SP demo):
 *
 *   npm run db:seed:placeholders -- [--dry-run] [--products] [--banners] [--icons] [--yes]
 *
 * - Không truyền --products/--banners/--icons → làm cả ba.
 * - Ảnh SP: SP đã đăng chưa có ảnh. Banner: chỉ khi chưa có banner nào (2 banner). Icon: danh mục gốc chưa có icon.
 * - Đi qua domain (`addProductImages`, `createBanner`, `setCategoryIcon`): cùng kiểm tra ảnh + AuditLog như admin.
 * - STORAGE_DRIVER=vercel-blob (Blob public) → bắt buộc --yes để tránh chạy nhầm DB/Blob. KHÔNG dùng cho production thật.
 * - Trang chủ/catalog cache theo tag: ảnh mới có thể hiện sau vài phút (hết hạn cache) hoặc sau khi redeploy.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { bannerSvg, hueOf, iconSvg, productSvg, toWebp } from "./lib/placeholder-art";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const picked = ["--products", "--banners", "--icons"].filter((a) => args.has(a));
const want = (a: string) => picked.length === 0 || picked.includes(a);
const log = (msg: string) => console.log(msg);
const webp = async (svg: string) => ({ data: await toWebp(svg), mime: "image/webp" });

const BANNERS = [
  { title: "Quality-checked cosmetics", subtitle: "Direct from Vietnam", hue: 350, alt: "T&C Cosmetics — demo banner 1" },
  { title: "New arrivals every month", subtitle: "Skincare · Makeup · Body care", hue: 150, alt: "T&C Cosmetics — demo banner 2" },
];

function dbHost() {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "?";
  } catch {
    return "?";
  }
}

async function main() {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  log(`${DRY ? "[dry-run] " : ""}Ảnh minh hoạ → DB ${dbHost()} · storage ${driver}`);
  if (driver === "vercel-blob" && !DRY && !args.has("--yes")) {
    throw new Error("STORAGE_DRIVER=vercel-blob: kiểm tra DB/Blob đích ở dòng trên rồi chạy lại với --yes.");
  }
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("Chưa có nhân viên ADMIN — chạy `npm run db:seed` trước.");

  const { addProductImages } = await import("../src/server/catalog/images");
  const { setCategoryIcon } = await import("../src/server/catalog/categories");
  const { createBanner } = await import("../src/server/content/banners");

  if (want("--products")) {
    const products = await prisma.product.findMany({
      where: { published: true, images: { none: {} } },
      include: {
        brand: { select: { name: true } },
        translations: { select: { locale: true, name: true } },
        variants: { where: { active: true }, orderBy: { priceMmk: "asc" }, take: 1, select: { label: true } },
      },
      orderBy: { slug: "asc" },
    });
    log(`• Ảnh SP: ${products.length} SP chưa có ảnh`);
    if (!DRY) {
      for (const p of products) {
        const name = (p.translations.find((t) => t.locale === "en") ?? p.translations[0])?.name ?? p.slug;
        const svg = productSvg({ brand: p.brand.name, name, label: p.variants[0]?.label ?? "", hue: hueOf(p.slug) });
        await addProductImages(p.id, [await webp(svg)], admin.id);
      }
    }
  }

  if (want("--banners")) {
    const count = await prisma.banner.count();
    if (count > 0) log(`• Banner: đã có ${count} → bỏ qua`);
    else {
      log(`• Banner: tạo ${BANNERS.length}`);
      if (!DRY) {
        for (const b of BANNERS) {
          const desktop = await webp(bannerSvg({ ...b, w: 1500, h: 500 }));
          const mobile = await webp(bannerSvg({ ...b, w: 750, h: 500 }));
          await createBanner(
            { alt: b.alt, locale: null, href: null, active: true, startAt: null, endAt: null },
            { desktop, mobile },
            admin.id,
          );
        }
      }
    }
  }

  if (want("--icons")) {
    const cats = await prisma.category.findMany({
      where: { parentId: null, iconFileId: null },
      include: { translations: { select: { locale: true, name: true } } },
      orderBy: { sortOrder: "asc" },
    });
    log(`• Icon danh mục: ${cats.length} danh mục gốc chưa có icon`);
    if (!DRY) {
      for (const c of cats) {
        const name = (c.translations.find((t) => t.locale === "en") ?? c.translations[0])?.name ?? c.slug;
        await setCategoryIcon(c.id, await webp(iconSvg({ letter: name, hue: hueOf(c.slug) })), admin.id);
      }
    }
  }
  log("Xong.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

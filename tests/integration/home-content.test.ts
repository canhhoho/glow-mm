import { readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { LocalDiskStorage } from "@/server/adapters/storage/local";
import { deleteCategory, removeCategoryIcon, setCategoryIcon, updateCategory } from "@/server/catalog/categories";
import { listRootCategories } from "@/server/catalog/queries";
import { findCategorySlugRedirect } from "@/server/catalog/store-slugs";
import { activeBanners, createBanner, deleteBanner, moveBanner, setBannerActive, updateBanner } from "@/server/content/banners";
import {
  addCollectionProducts,
  collectionVisible,
  createCollection,
  deleteCollection,
  getCollectionAdmin,
  getStoreCollection,
  homeCollections,
  listCollectionsAdmin,
  moveCollectionProduct,
  removeCollectionProduct,
  updateCollection,
} from "@/server/content/collections";
import { makeFixture } from "./fixtures";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const png = { data: PNG, mime: "image/png" };
const jpeg = { data: JPEG, mime: "image/jpeg" };
const disk = () => new LocalDiskStorage(env().LOCAL_STORAGE_DIR);
const DAY = 86_400_000;
const open = { active: true, startAt: null, endAt: null };

async function filesUnder(prefix: string) {
  try {
    return await readdir(path.join(path.resolve(env().LOCAL_STORAGE_DIR), prefix));
  } catch {
    return [];
  }
}

afterEach(() => vi.restoreAllMocks());

describe("Banner trang chủ", () => {
  it("lọc theo ngôn ngữ + lịch + bật/tắt; sắp xếp; thay/bỏ ảnh dọn file cũ; xoá dọn file", async () => {
    const { userId, tag } = await makeFixture();
    const now = new Date();
    const mk = (alt: string, extra: object = {}) =>
      createBanner({ alt: `${tag} ${alt}`, locale: null, href: "/c/skincare", ...open, ...extra }, { desktop: png }, userId);
    const all = await mk("all");
    const my = await mk("my", { locale: "my" });
    await mk("future", { startAt: new Date(now.getTime() + DAY) });
    await mk("ended", { endAt: new Date(now.getTime() - DAY) });
    const off = await mk("off");
    await setBannerActive(off.id, false, userId);

    const mine = (list: { alt: string }[]) => list.map((b) => b.alt).filter((a) => a.startsWith(tag));
    expect(mine(await activeBanners("my", now))).toEqual([`${tag} all`, `${tag} my`]);
    expect(mine(await activeBanners("en", now))).toEqual([`${tag} all`]);

    expect(await moveBanner(my.id, "up", userId)).toBe(true);
    expect(mine(await activeBanners("my", now))).toEqual([`${tag} my`, `${tag} all`]);

    // Thay ảnh desktop + thêm ảnh mobile → file desktop cũ bị xoá.
    const before = await prisma.banner.findUniqueOrThrow({ where: { id: all.id }, include: { desktopFile: true } });
    await updateBanner(all.id, { alt: `${tag} all`, locale: null, href: null, ...open }, { desktop: jpeg, mobile: png }, userId);
    const after = await prisma.banner.findUniqueOrThrow({ where: { id: all.id }, include: { desktopFile: true, mobileFile: true } });
    expect(after.desktopFile.mime).toBe("image/jpeg");
    expect(after.mobileFile?.mime).toBe("image/png");
    expect(await prisma.fileObject.findUnique({ where: { id: before.desktopFileId } })).toBeNull();
    expect(await disk().get(before.desktopFile.key)).toBeNull();
    expect(await disk().get(after.desktopFile.key)).not.toBeNull();

    // Bỏ ảnh mobile.
    await updateBanner(all.id, { alt: `${tag} all`, locale: null, href: null, ...open }, { removeMobile: true }, userId);
    expect((await prisma.banner.findUniqueOrThrow({ where: { id: all.id } })).mobileFileId).toBeNull();
    expect(await disk().get(after.mobileFile!.key)).toBeNull();

    await deleteBanner(all.id, userId);
    expect(await prisma.fileObject.findUnique({ where: { id: after.desktopFileId } })).toBeNull();
    expect(await disk().get(after.desktopFile.key)).toBeNull();

    // Dọn: CI chạy integration trước E2E trên cùng DB → không để banner test lọt lên trang chủ.
    for (const b of await prisma.banner.findMany({ where: { alt: { startsWith: tag } } })) await deleteBanner(b.id, userId);
  });

  it("từ chối SVG, link javascript:, lịch ngược; DB lỗi thì không để file mồ côi", async () => {
    const { userId, tag } = await makeFixture();
    const base = { alt: tag, locale: null, href: null, ...open };
    await expect(createBanner(base, { desktop: { data: Buffer.from("<svg/>"), mime: "image/png" } }, userId)).rejects.toThrow(/không hợp lệ/);
    await expect(createBanner({ ...base, href: "javascript:alert(1)" }, { desktop: png }, userId)).rejects.toThrow(/Link/);
    await expect(
      createBanner({ ...base, startAt: new Date("2026-10-20"), endAt: new Date("2026-10-19") }, { desktop: png }, userId),
    ).rejects.toThrow(/kết thúc/);

    const filesBefore = (await filesUnder("banners")).length;
    const objectsBefore = await prisma.fileObject.count();
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("db down"));
    await expect(createBanner(base, { desktop: png, mobile: jpeg }, userId)).rejects.toThrow("db down");
    expect((await filesUnder("banners")).length).toBe(filesBefore);
    expect(await prisma.fileObject.count()).toBe(objectsBefore);
  });
});

describe("Bộ sưu tập", () => {
  it("chọn tay + thứ tự; chỉ hiện SP đã đăng; lịch / bật-tắt / cờ trang chủ", async () => {
    const a = await makeFixture();
    const b = await makeFixture();
    const hidden = await makeFixture(); // chưa đăng
    await prisma.product.updateMany({ where: { id: { in: [a.productId, b.productId] } }, data: { published: true, approvedAt: new Date() } });
    const userId = a.userId;
    const slug = `it-${a.tag.toLowerCase()}`;
    const now = new Date();

    const c = await createCollection({ slug, nameMy: "စုစည်းမှု", nameEn: `IT ${a.tag}`, showOnHome: true, ...open }, userId);
    await expect(createCollection({ slug, nameMy: "x", nameEn: "x", showOnHome: true, ...open }, userId)).rejects.toThrow(/Slug/);
    expect(await addCollectionProducts(c.id, [a.productId, b.productId, hidden.productId], userId)).toBe(3);
    expect(await addCollectionProducts(c.id, [a.productId], userId)).toBe(0); // đã có
    await expect(addCollectionProducts(c.id, ["khong-co"], userId)).rejects.toThrow(/không tồn tại/);

    const page = await getStoreCollection(slug, "en", now);
    expect(page?.name).toBe(`IT ${a.tag}`);
    expect(page?.products.map((p) => p.slug)).toEqual([`it-${a.tag}`, `it-${b.tag}`]); // SP chưa đăng bị lọc

    await moveCollectionProduct(c.id, b.productId, "up", userId);
    expect((await getStoreCollection(slug, "my", now))?.products.map((p) => p.slug)).toEqual([`it-${b.tag}`, `it-${a.tag}`]);
    await removeCollectionProduct(c.id, b.productId, userId);
    expect((await getStoreCollection(slug, "my", now))?.products.map((p) => p.slug)).toEqual([`it-${a.tag}`]);

    const onHome = async () => (await homeCollections("my", now)).some((x) => x.slug === slug);
    expect(await onHome()).toBe(true);
    expect((await homeCollections("my", now)).find((x) => x.slug === slug)?.name).toBe("စုစည်းမှု");

    const edit = (patch: object) =>
      updateCollection(c.id, { slug, nameMy: "စုစည်းမှု", nameEn: `IT ${a.tag}`, showOnHome: true, ...open, ...patch }, userId);
    await edit({ showOnHome: false });
    expect(await onHome()).toBe(false);
    expect(await collectionVisible(slug, now)).toBe(true); // vẫn mở được trang riêng
    await edit({ startAt: new Date(now.getTime() + DAY) });
    expect(await collectionVisible(slug, now)).toBe(false);
    expect(await getStoreCollection(slug, "en", now)).toBeNull();
    await edit({ active: false });
    expect(await collectionVisible(slug, now)).toBe(false);
    await edit({});
    expect(await collectionVisible(slug, now)).toBe(true);
    await deleteCollection(c.id, userId); // dọn (xem ghi chú ở test banner)
    expect(await collectionVisible(slug, now)).toBe(false);
  });
});

describe("Bộ sưu tập: SP ngừng kinh doanh và số hiện ngoài web (#8)", () => {
  it("phân biệt ngừng KD với đang ẩn; đếm số hiện ngoài web; không thêm mới SP ngừng KD", async () => {
    const live = await makeFixture();
    const hidden = await makeFixture();
    const gone = await makeFixture(); // sẽ ngừng kinh doanh sau khi đã nằm trong bộ sưu tập
    const fresh = await makeFixture();
    await prisma.product.updateMany({ where: { id: { in: [live.productId, gone.productId] } }, data: { published: true, approvedAt: new Date() } });
    const userId = live.userId;
    const c = await createCollection({ slug: `it-${live.tag.toLowerCase()}-arch`, nameMy: "စုစည်းမှု", nameEn: `IT ${live.tag}`, showOnHome: false, ...open }, userId);
    expect(await addCollectionProducts(c.id, [live.productId, hidden.productId, gone.productId], userId)).toBe(3);
    // Ngừng kinh doanh: ẩn khỏi web (published=false) + archivedAt — như nút Xoá SP có lịch sử.
    await prisma.product.update({ where: { id: gone.productId }, data: { archivedAt: new Date(), published: false } });

    const detail = (await getCollectionAdmin(c.id))!;
    const by = (id: string) => detail.items.find((i) => i.productId === id)!;
    expect(by(live.productId)).toMatchObject({ published: true, archived: false, visible: true });
    expect(by(hidden.productId)).toMatchObject({ published: false, archived: false, visible: false }); // đang ẩn, chưa đăng
    expect(by(gone.productId)).toMatchObject({ published: false, archived: true, visible: false }); // ngừng KD: giữ dòng, có cờ riêng
    // Số đã cấu hình (3) khác số thực sự hiện ngoài web (1).
    expect((await listCollectionsAdmin()).find((x) => x.id === c.id)).toMatchObject({ items: 3, visible: 1 });
    expect((await getStoreCollection(c.slug, "en", new Date()))?.products.map((p) => p.slug)).toEqual([`it-${live.tag}`]);

    // Thêm mới: SP ngừng KD bị bỏ qua trong lô; chỉ có SP ngừng KD → báo lỗi rõ.
    expect(await addCollectionProducts(c.id, [gone.productId, fresh.productId], userId)).toBe(1);
    const other = await makeFixture();
    await prisma.product.update({ where: { id: other.productId }, data: { archivedAt: new Date() } });
    await expect(addCollectionProducts(c.id, [other.productId], userId)).rejects.toThrow(/ngừng kinh doanh/);
    await deleteCollection(c.id, userId);
  });
});

describe("Danh mục: sửa + icon", () => {
  it("tối đa 2 cấp; đổi tên; icon thay/xoá dọn file; trang chủ thấy iconUrl", async () => {
    const f = await makeFixture();
    const parent = await makeFixture();
    await prisma.product.update({ where: { id: f.productId }, data: { published: true, approvedAt: new Date() } });
    const input = { nameMy: "အမျိုးအစား", nameEn: `Cat ${f.tag}`, parentId: null, sortOrder: 5 };

    await expect(updateCategory(f.categoryId, { ...input, parentId: f.categoryId }, f.userId)).rejects.toThrow(/chính nó/);
    await updateCategory(parent.categoryId, { ...input, nameEn: "child", parentId: f.categoryId }, f.userId); // parent → con của f
    await expect(updateCategory(f.categoryId, { ...input, parentId: parent.categoryId }, f.userId)).rejects.toThrow(/danh mục con|gốc/);
    await expect(updateCategory(parent.categoryId, { ...input, parentId: "khong-co" }, f.userId)).rejects.toThrow(/không tồn tại/);

    await updateCategory(f.categoryId, input, f.userId);
    const root = (await listRootCategories("en")).find((c) => c.slug === `it-${f.tag}`);
    expect(root).toMatchObject({ name: `Cat ${f.tag}`, iconUrl: null });

    await expect(setCategoryIcon(f.categoryId, { data: Buffer.from("<svg/>"), mime: "image/png" }, f.userId)).rejects.toThrow(/không hợp lệ/);
    await setCategoryIcon(f.categoryId, png, f.userId);
    const first = await prisma.category.findUniqueOrThrow({ where: { id: f.categoryId }, include: { icon: true } });
    await setCategoryIcon(f.categoryId, jpeg, f.userId);
    const second = await prisma.category.findUniqueOrThrow({ where: { id: f.categoryId }, include: { icon: true } });
    expect(second.icon?.mime).toBe("image/jpeg");
    expect(await disk().get(first.icon!.key)).toBeNull(); // icon cũ đã xoá
    expect((await listRootCategories("en")).find((c) => c.slug === `it-${f.tag}`)?.iconUrl).toBe(second.icon?.url);

    await removeCategoryIcon(f.categoryId, f.userId);
    expect(await disk().get(second.icon!.key)).toBeNull();
    expect(await prisma.fileObject.findUnique({ where: { id: second.icon!.id } })).toBeNull();
  });

  it("đổi slug: slug cũ chuyển về slug hiện tại, dùng lại slug cũ, chặn trùng; xoá danh mục dọn redirect", async () => {
    const f = await makeFixture();
    const other = await makeFixture();
    const input = { nameMy: "အမျိုးအစား", nameEn: "Lipstick", parentId: null, sortOrder: 0 };
    const t = f.tag.toLowerCase(); // slug fixture viết hoa (tạo thẳng bằng Prisma) → slug mới dùng chữ thường
    const [s0, s1, s2] = [`it-${f.tag}`, `it-lip-${t}`, `it-lips-${t}`];

    await updateCategory(f.categoryId, { ...input, slug: s1 }, f.userId);
    expect(await findCategorySlugRedirect(s0)).toBe(s1);
    await updateCategory(f.categoryId, { ...input, slug: s2 }, f.userId);
    expect([await findCategorySlugRedirect(s0), await findCategorySlugRedirect(s1)]).toEqual([s2, s2]); // không thành chuỗi
    const audit = { action: "category.update", entityId: f.categoryId, data: { equals: { slugFrom: s1, slugTo: s2 } } };
    expect(await prisma.auditLog.count({ where: audit })).toBe(1);

    await updateCategory(f.categoryId, { ...input, slug: s1 }, f.userId); // dùng lại slug cũ
    expect(await findCategorySlugRedirect(s1)).toBeNull();
    expect([await findCategorySlugRedirect(s0), await findCategorySlugRedirect(s2)]).toEqual([s1, s1]);
    await updateCategory(f.categoryId, input, f.userId); // không gửi slug = giữ nguyên
    expect((await prisma.category.findUniqueOrThrow({ where: { id: f.categoryId } })).slug).toBe(s1);

    const taken = `it-other-${other.tag.toLowerCase()}`;
    await prisma.category.update({ where: { id: other.categoryId }, data: { slug: taken } });
    await expect(updateCategory(f.categoryId, { ...input, slug: taken }, f.userId)).rejects.toThrow(/đã được dùng/);
    await expect(updateCategory(f.categoryId, { ...input, slug: "Có Dấu" }, f.userId)).rejects.toThrow(/a-z/);
    expect(await findCategorySlugRedirect(s1)).toBeNull(); // lỗi → transaction không ghi gì

    const empty = await prisma.category.create({ data: { slug: `it-gone-${t}` } });
    await updateCategory(empty.id, { ...input, slug: `it-gone2-${t}` }, f.userId);
    expect(await findCategorySlugRedirect(`it-gone-${t}`)).toBe(`it-gone2-${t}`);
    await deleteCategory(empty.id, f.userId);
    expect(await findCategorySlugRedirect(`it-gone-${t}`)).toBeNull();
  });

  it("xoá chỉ khi trống (không SP, không con); dọn bản dịch + icon; ghi audit", async () => {
    const f = await makeFixture();
    const child = await makeFixture();
    await prisma.product.update({ where: { id: child.productId }, data: { categoryId: f.categoryId } }); // child trống SP
    const input = { nameMy: "အမျိုးအစား", nameEn: "child", parentId: f.categoryId, sortOrder: 0 };
    await updateCategory(child.categoryId, input, f.userId);

    await expect(deleteCategory(f.categoryId, f.userId)).rejects.toThrow(/còn sản phẩm/);
    await prisma.product.updateMany({ where: { categoryId: f.categoryId }, data: { categoryId: child.categoryId } });
    await expect(deleteCategory(f.categoryId, f.userId)).rejects.toThrow(/danh mục con/);
    await expect(deleteCategory("khong-co", f.userId)).rejects.toThrow(/Không tìm thấy/);

    // Danh mục gốc trống, có icon → xoá được, icon + bản dịch đi theo.
    const empty = await prisma.category.create({
      data: { slug: `it-empty-${f.tag}`, translations: { create: [{ locale: "en", name: "Empty" }] } },
    });
    await setCategoryIcon(empty.id, png, f.userId);
    const icon = (await prisma.category.findUniqueOrThrow({ where: { id: empty.id }, include: { icon: true } })).icon!;
    await deleteCategory(empty.id, f.userId);
    expect(await prisma.category.findUnique({ where: { id: empty.id } })).toBeNull();
    expect(await prisma.categoryTranslation.count({ where: { categoryId: empty.id } })).toBe(0);
    expect(await prisma.fileObject.findUnique({ where: { id: icon.id } })).toBeNull();
    expect(await disk().get(icon.key)).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "category.delete", entityId: empty.id } })).toBe(1);
  });
});

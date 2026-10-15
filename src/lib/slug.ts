/** Tạo slug ASCII từ chuỗi (bỏ dấu tiếng Việt). Chữ Myanmar không chuyển được → dùng fallback. */
export function slugify(input: string, fallback = "item"): string {
  const s = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || fallback;
}

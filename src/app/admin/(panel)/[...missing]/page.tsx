import { notFound } from "next/navigation";

/** Đường dẫn /admin/... không khớp trang nào → 404 trong khung admin (layout vẫn bắt đăng nhập trước). */
export default function MissingAdminPage(): never {
  notFound();
}

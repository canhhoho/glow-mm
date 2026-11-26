import { notFound } from "next/navigation";

/** Đường dẫn /ctv/... không khớp trang nào → 404 trong khung CTV (layout vẫn bắt đăng nhập CTV trước). */
export default function MissingCtvPage(): never {
  notFound();
}

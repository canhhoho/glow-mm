import { notFound } from "next/navigation";

/**
 * Đích rewrite của proxy khi slug sản phẩm/danh mục/trang thông tin không tồn tại.
 * notFound() chạy lúc prerender → trang tĩnh (layout + not-found.tsx) được phục vụ với HTTP 404 thật.
 */
export default function NotFoundRoute() {
  notFound();
}

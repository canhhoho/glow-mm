/**
 * Hỏi xác nhận trước thao tác khó hoàn tác — một chỗ duy nhất cho admin, storefront, CTV.
 * Dùng hộp thoại gốc của trình duyệt (UI_AUDIT 4A: không JS thêm, chạy tốt trên điện thoại, E2E bắt bằng `page.on("dialog")`).
 * Muốn đổi sang modal sau này chỉ sửa file này. Chỉ gọi phía client (handler sự kiện).
 */

/** `true` khi không cần hỏi (`message` rỗng) hoặc người dùng bấm OK. */
export function askConfirm(message: string | undefined): boolean {
  return !message || window.confirm(message);
}

/** Handler `onSubmit`/`onClick`: bấm Huỷ → `preventDefault`, form không gửi. */
export function confirmOrPrevent(message: string | undefined) {
  return (e: { preventDefault(): void }) => {
    if (!askConfirm(message)) e.preventDefault();
  };
}

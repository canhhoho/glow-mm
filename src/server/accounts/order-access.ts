import "server-only";
import { cookies } from "next/headers";
import { getCustomerUser } from "@/server/auth/customer-session";
import { ORDERS_COOKIE, parseOrderAccess } from "@/server/cart/cart";
import { findOrderForAccount, findOrderForCustomer } from "@/server/orders/orders";

/**
 * Khách có quyền với đơn `code` không (trang đơn, gửi biên lai, đánh giá):
 * - trình duyệt đã đặt/tra cứu đơn (cookie mã đơn + SĐT), hoặc
 * - đơn thuộc tài khoản khách đang đăng nhập (P14).
 * Trả đơn kèm SĐT người nhận (domain biên lai/đánh giá xác thực bằng mã + SĐT) hoặc null.
 */
export async function customerOrder(code: string) {
  const access = parseOrderAccess((await cookies()).get(ORDERS_COOKIE)?.value).find((a) => a.c === code);
  const byCookie = access ? await findOrderForCustomer(code, access.p) : null;
  if (byCookie) return byCookie;
  const user = await getCustomerUser();
  return user ? findOrderForAccount(code, user.id) : null;
}

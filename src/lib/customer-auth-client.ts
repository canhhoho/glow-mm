import { createAuthClient } from "better-auth/react";

/** Client Better Auth của khách (gọi /api/customer-auth trên cùng origin) — chỉ import ở trang đăng nhập/đăng ký. */
export const customerAuthClient = createAuthClient({ basePath: "/api/customer-auth" });

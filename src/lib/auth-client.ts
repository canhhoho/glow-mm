import { createAuthClient } from "better-auth/react";

/** Client Better Auth (gọi /api/auth trên cùng origin). */
export const authClient = createAuthClient();

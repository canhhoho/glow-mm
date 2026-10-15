import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // react-server: cho phép seed gọi hàm nghiệp vụ trong src/server (có `import "server-only"`).
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // CLI (migrate) ưu tiên kết nối TRỰC TIẾP (Neon: không qua pooler); app dùng DATABASE_URL.
    url: process.env["DIRECT_DATABASE_URL"] || process.env["DATABASE_URL"],
  },
});

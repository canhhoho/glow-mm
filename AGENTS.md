<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Luật của dự án (mọi agent: Claude Code, Codex, Antigravity)

Đọc `CLAUDE.md` trước khi làm việc và tuân thủ mọi luật trong đó. `CLAUDE.md` là nguồn chính; không chép luật sang nơi khác. Các luật sống còn, nhắc lại vì vi phạm gây hậu quả không đảo ngược:

- Không push hay merge vào `main` (push `main` = tự động deploy production). Không gắn tag release, không deploy, không SSH tới server. Push `dev` hoặc mở PR chỉ khi người dùng yêu cầu.
- Không in, commit hay đọc nội dung `.env*` / secret. Test chỉ dùng giá trị `.env.test`.
- Chỉ ghi DB dev/test/tạm (`glow_test`). Không chạy `db:reset`, `prisma migrate reset`, migration phá huỷ; không đụng dữ liệu production, `backups/`, `storage/`.
- Không sửa `docker-compose.prod.yml`, `Dockerfile`, `ops/*`, `.github/workflows/*`, cấu hình Nginx khi chưa được người dùng cho phép.
- Không chạy code PR/chưa tin cậy trên runner production; không cấp root, sudo toàn phần hay Docker group cho runner.
- Tồn kho chỉ đổi qua `StockDocument` → `StockLedger`; đơn chỉ đổi trạng thái qua `src/server/orders/state-machine.ts`.
- Sau mỗi thay đổi chạy `npm run check`; báo cáo test đủ 4 dòng: Đạt / Lỗi / Bỏ qua / Không chạy.

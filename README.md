# Glow VN — Web bán mỹ phẩm VN → Myanmar

- Kế hoạch: [PLAN.md](PLAN.md) · Quy tắc & lệnh: [CLAUDE.md](CLAUDE.md) · Triển khai: [DEPLOY.md](DEPLOY.md)

## Chạy nhanh

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate && npm run db:seed
npm run dev
```

Storefront: http://localhost:3000 (tiếng Myanmar) · http://localhost:3000/en · Admin: http://localhost:3000/admin
Tài khoản mẫu: `admin@glow.local`, `kho@glow.local`, `donhang@glow.local` — mật khẩu = `SEED_STAFF_PASSWORD` trong `.env`.

## Test

```bash
npm test
```

## Bản dịch (duyệt tiếng Myanmar)

Chuỗi giao diện nằm trong `messages/` (storefront `store.{my,en}.json`, admin `admin.{vi,en,my}.json`).
Danh sách chuỗi tiếng Myanmar **cần người bản ngữ duyệt** ở `messages/review-my.json`.

```bash
npm run i18n:export
```

Lệnh trên tạo `i18n-export.csv` (mở bằng Excel). Người duyệt sửa cột `my`, rồi **xoá chữ `x` ở cột `review`** của dòng đã duyệt.

```bash
npm run i18n:import -- i18n-export.csv
```

Lệnh trên ghi lại cột `my` (tự chuyển Zawgyi → Unicode) và bỏ các dòng đã duyệt khỏi `review-my.json`. Gặp key lạ hoặc thiếu/thừa biến như `{count}` thì lệnh báo lỗi và không ghi gì.

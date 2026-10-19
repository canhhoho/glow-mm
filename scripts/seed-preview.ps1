# Nạp dữ liệu demo + ảnh minh hoạ vào bản Preview (Neon nhánh preview + Vercel Blob) — chạy MỘT lệnh:
#
#   npm run seed:preview
#
# Script hỏi chuỗi kết nối Neon (direct) và token Blob — nhập ẩn, không lưu vào file, xoá khỏi môi trường khi xong.
# Các bước: kiểm tra đầu vào → db:seed:demo --no-images → db:seed:placeholders --dry-run → hỏi xác nhận → chạy thật.
# Không dùng cho Production. Cần đã chạy `npm run db:seed` trên DB preview (DEPLOY.md §1.3 bước 6).

param(
  # Để trống → script hỏi (nhập ẩn). Truyền tham số chỉ để kiểm thử: giá trị sẽ nằm trong lịch sử lệnh.
  [string]$DatabaseUrl,
  [string]$BlobToken
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Split-Path $PSScriptRoot -Parent)

function Read-Secret([string]$prompt) {
  $s = Read-Host -Prompt $prompt -AsSecureString
  return (ConvertFrom-SecureString -SecureString $s -AsPlainText).Trim().Trim('"')
}

function Invoke-Step([string]$title, [string[]]$npmArgs) {
  Write-Host ""
  Write-Host "== $title" -ForegroundColor Cyan
  & npm @npmArgs
  if ($LASTEXITCODE -ne 0) { throw "Bước '$title' lỗi (mã $LASTEXITCODE) — xem thông báo ở trên." }
}

$saved = @{}
foreach ($k in "DATABASE_URL", "DIRECT_DATABASE_URL", "STORAGE_DRIVER", "BLOB_READ_WRITE_TOKEN") {
  $saved[$k] = [Environment]::GetEnvironmentVariable($k)
}

try {
  Write-Host "Nạp dữ liệu demo + ảnh minh hoạ cho bản PREVIEW (không dùng cho Production)." -ForegroundColor Yellow
  $db = if ($DatabaseUrl) { $DatabaseUrl.Trim().Trim('"') } else { Read-Secret "Chuỗi kết nối Neon nhánh preview (direct, không có -pooler)" }
  $token = if ($BlobToken) { $BlobToken.Trim().Trim('"') } else { Read-Secret "BLOB_READ_WRITE_TOKEN của project (Vercel > Storage > Blob)" }

  try { $uri = [Uri]$db } catch { throw "Chuỗi kết nối không hợp lệ (phải bắt đầu bằng postgresql://)." }
  if ($uri.Scheme -notin "postgresql", "postgres") { throw "Chuỗi kết nối phải bắt đầu bằng postgresql://" }
  if ($uri.Host -in "localhost", "127.0.0.1") { throw "Đây là DB local ($($uri.Host)) — script này chỉ dành cho Neon preview." }
  if ($uri.Host -like "*-pooler*") { throw "Đang dùng chuỗi pooled ($($uri.Host)) — hãy lấy chuỗi direct (tắt Connection pooling)." }
  if ($token -notlike "vercel_blob_rw_*") { throw "Token Blob phải bắt đầu bằng vercel_blob_rw_" }

  $env:DATABASE_URL = $db
  $env:DIRECT_DATABASE_URL = $db
  $env:STORAGE_DRIVER = "vercel-blob"
  $env:BLOB_READ_WRITE_TOKEN = $token
  Write-Host "DB đích: $($uri.Host)$($uri.AbsolutePath)" -ForegroundColor Green

  Invoke-Step "Sản phẩm demo (không kèm ảnh lengocanh.vn)" @("run", "db:seed:demo", "--", "--no-images")
  Invoke-Step "Ảnh minh hoạ — chạy thử (chưa ghi gì)" @("run", "db:seed:placeholders", "--", "--dry-run")

  Write-Host ""
  $ok = Read-Host "Tạo ảnh lên Blob cho DB $($uri.Host)? Gõ YES để tiếp tục"
  if ($ok -cne "YES") { Write-Host "Đã huỷ, chưa tạo ảnh nào." -ForegroundColor Yellow; return }

  Invoke-Step "Ảnh minh hoạ — chạy thật" @("run", "db:seed:placeholders", "--", "--yes")
  Write-Host ""
  Write-Host "Xong. Ảnh có thể chậm vài phút mới hiện (cache) — hoặc Redeploy bản Preview trên Vercel." -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "LỖI: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  # Trả biến môi trường về như cũ để các lệnh sau không ghi nhầm vào DB/Blob preview.
  foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
}

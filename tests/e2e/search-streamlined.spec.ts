import { expect, test } from "@playwright/test";

test.describe("E1: Tìm kiếm gọn (Audit 13, 14)", () => {
  test("trang tìm kiếm: đồng bộ giá trị q trên desktop & mobile", async ({ page, isMobile }) => {
    await page.goto("/en/search?q=Sunscreen");

    // Ô tìm kiếm đang hiển thị
    const visibleBoxes = page.getByRole("searchbox").filter({ visible: true });
    if (isMobile) {
      // Mobile chỉ có 1 ô tìm kiếm (trên header)
      await expect(visibleBoxes).toHaveCount(1);
      await expect(visibleBoxes.first()).toHaveValue("Sunscreen");
    } else {
      // Desktop có ô header và ô trong trang, cả 2 cùng giá trị "Sunscreen"
      const count = await visibleBoxes.count();
      for (let i = 0; i < count; i++) {
        await expect(visibleBoxes.nth(i)).toHaveValue("Sunscreen");
      }
    }
  });

  test("tìm kiếm rỗng: ẩn phân trang pageCount, có nút Xoá bộ lọc và lối về trang chủ", async ({ page }) => {
    await page.goto("/en/search?q=KhongCoSanPhamNaoTrung123456");

    // Không tìm thấy sản phẩm
    await expect(page.getByText("No products found")).toBeVisible();

    // Ẩn phân trang / pageCount
    await expect(page.getByText(/Page 1/)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Product pagination" })).toHaveCount(0);

    // Có nút Xoá bộ lọc (Clear filters) và Về trang chủ (Back to home)
    const clearBtn = page.getByRole("link", { name: "Clear filters" });
    const homeBtn = page.getByRole("link", { name: "Back to home" });
    await expect(clearBtn).toBeVisible();
    await expect(homeBtn).toBeVisible();

    // Bấm Clear filters chuyển về trang tìm kiếm trống
    await clearBtn.click();
    await expect(page).toHaveURL(/\/en\/search$/);
  });
});

/** Trang thông tin tĩnh của storefront (nội dung trong messages/store.*.json, namespace `Info`). */
export const INFO_PAGES = ["about", "shipping", "payment", "returns", "privacy"] as const;
export type InfoPage = (typeof INFO_PAGES)[number];

export function isInfoPage(slug: string): slug is InfoPage {
  return (INFO_PAGES as readonly string[]).includes(slug);
}

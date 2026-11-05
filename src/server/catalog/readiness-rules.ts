/**
 * D2 — quy tắc "sẵn sàng mở bán" (thuần, không DB → test bằng Vitest).
 * `errors` chặn bật hiển thị; `warnings` cho phép nhưng cần biết. Không tự ẩn SP đang hiển thị.
 * Quyết định của chủ shop: thiếu ảnh chỉ cảnh báo; SP đang hiển thị vẫn lưu được, chỉ chặn giá ≤ 0 / không còn biến thể.
 */

export const ERROR_CODES = ["NO_ACTIVE_VARIANT", "BAD_LOCATION", "PRICE_ZERO", "NO_WEIGHT"] as const;
export const WARNING_CODES = [
  "NO_IMAGE",
  "FEW_IMAGES",
  "MISSING_ALT",
  "CONTENT_INCOMPLETE",
  "NO_WEIGHT_LOCAL",
  "COST_MISSING",
  "COST_ESTIMATED",
  "OUT_OF_STOCK",
  "STOCK_OTHER_WAREHOUSE",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export type WarningCode = (typeof WARNING_CODES)[number];
export type IssueCode = ErrorCode | WarningCode;
/** `skus`: biến thể liên quan (nếu lỗi theo biến thể). */
export type Issue = { code: IssueCode; skus?: string[] };

/** Lỗi vẫn chặn khi lưu SP ĐANG hiển thị (các lỗi khác chỉ chặn lúc bật hiển thị). */
export const ALWAYS_BLOCKING: readonly ErrorCode[] = ["NO_ACTIVE_VARIANT", "PRICE_ZERO"];

export type ReadinessInput = {
  location: { active: boolean; sellable: boolean; pricingMode: "VN_IMPORT" | "LOCAL_MMK" | null };
  imageCount: number;
  coverHasAlt: boolean;
  /** Mô tả + cách dùng theo ngôn ngữ nhập liệu (my, en). */
  content: { description: string | null; usage: string | null }[];
  variants: {
    id: string;
    sku: string;
    active: boolean;
    priceMmk: number;
    weightGrams: number | null;
    isBundle: boolean;
    /** Khối lượng các thành phần combo (null nếu không phải combo). */
    componentWeights: (number | null)[] | null;
  }[];
  /** Khả dụng bán theo biến thể (đã trừ giữ hàng, hạn, kho của SP). */
  available: Map<string, number>;
  /** SKU có tồn bán được nhưng lô thiếu giá vốn / đang dùng vốn tạm / tồn nằm ở kho bán khác. */
  costMissingSkus: string[];
  costEstimatedSkus: string[];
  otherWarehouseSkus: string[];
};

export type Readiness = { errors: Issue[]; warnings: Issue[] };

const withSkus = (code: IssueCode, skus: string[]): Issue[] => (skus.length ? [{ code, skus }] : []);

export function evaluateReadiness(p: ReadinessInput): Readiness {
  const active = p.variants.filter((v) => v.active);
  const hasWeight = (v: ReadinessInput["variants"][number]) =>
    (v.weightGrams ?? 0) > 0 ||
    (v.isBundle && !!v.componentWeights?.length && v.componentWeights.every((w) => (w ?? 0) > 0));
  const noWeight = active.filter((v) => !hasWeight(v)).map((v) => v.sku);
  const localMode = p.location.pricingMode === "LOCAL_MMK";

  const errors: Issue[] = [
    ...(active.length === 0 ? [{ code: "NO_ACTIVE_VARIANT" as const }] : []),
    ...(!p.location.active || !p.location.sellable ? [{ code: "BAD_LOCATION" as const }] : []),
    ...withSkus("PRICE_ZERO", active.filter((v) => v.priceMmk <= 0).map((v) => v.sku)),
    // Kho hàng nhập VN: công thức giá cần khối lượng (combo chưa khai báo → cộng thành phần).
    ...(localMode ? [] : withSkus("NO_WEIGHT", noWeight)),
  ];
  const warnings: Issue[] = [
    ...(p.imageCount === 0 ? [{ code: "NO_IMAGE" as const }] : []),
    ...(p.imageCount === 1 ? [{ code: "FEW_IMAGES" as const }] : []),
    ...(p.imageCount > 0 && !p.coverHasAlt ? [{ code: "MISSING_ALT" as const }] : []),
    ...(p.content.some((c) => !c.description?.trim() || !c.usage?.trim()) ? [{ code: "CONTENT_INCOMPLETE" as const }] : []),
    ...(localMode ? withSkus("NO_WEIGHT_LOCAL", noWeight) : []),
    ...withSkus("COST_MISSING", p.costMissingSkus),
    ...withSkus("COST_ESTIMATED", p.costEstimatedSkus),
    ...(active.length > 0 && active.every((v) => (p.available.get(v.id) ?? 0) <= 0) ? [{ code: "OUT_OF_STOCK" as const }] : []),
    ...withSkus("STOCK_OTHER_WAREHOUSE", p.otherWarehouseSkus),
  ];
  return { errors, warnings };
}

/**
 * Lỗi chặn khi lưu/bật: SP chuyển từ ẩn → hiển thị phải hết lỗi; SP đang hiển thị (và vẫn hiển thị)
 * chỉ bị chặn bởi `ALWAYS_BLOCKING`.
 */
export function blockingErrors(r: Readiness, wasPublished: boolean): Issue[] {
  return wasPublished ? r.errors.filter((e) => (ALWAYS_BLOCKING as readonly string[]).includes(e.code)) : r.errors;
}

export type ListStatus = "ARCHIVED" | "PUBLISHED" | "READY" | "INCOMPLETE";
export function listStatus(p: { archived: boolean; published: boolean }, r: Readiness): ListStatus {
  if (p.archived) return "ARCHIVED";
  if (p.published) return "PUBLISHED";
  return r.errors.length ? "INCOMPLETE" : "READY";
}

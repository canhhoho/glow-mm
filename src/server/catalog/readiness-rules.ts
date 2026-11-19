/**
 * D2 — quy tắc "sẵn sàng mở bán" (thuần, không DB → test bằng Vitest).
 * `errors` chặn bật hiển thị; `warnings` cho phép nhưng cần biết. Không tự ẩn SP đang hiển thị.
 * Quyết định của chủ shop: thiếu ảnh chỉ cảnh báo; SP đang hiển thị vẫn lưu được, chỉ chặn giá ≤ 0 / không còn biến thể.
 */
import { FEATURES } from "@/lib/features";

/**
 * NOT_APPROVED: không còn do `evaluateReadiness` sinh ra (P1-A: readiness = điều kiện, duyệt là thao tác riêng) —
 * chỉ `publishBlockers` thêm vào khi bản live chưa được duyệt (chặn bật hiển thị).
 */
/**
 * COMPONENT_INACTIVE (#6): combo đang dùng có thành phần đã tắt / thuộc SP ngừng kinh doanh — combo vẫn bán được nếu thành
 * phần còn tồn, nên chặn BẬT hiển thị; KHÔNG thuộc `ALWAYS_BLOCKING` → combo đang hiển thị vẫn lưu được, không tự ẩn.
 */
export const ERROR_CODES = ["NO_ACTIVE_VARIANT", "BAD_LOCATION", "NO_WAREHOUSE", "PRICE_ZERO", "NO_WEIGHT", "COMPONENT_INACTIVE", "NOT_APPROVED"] as const;
export const WARNING_CODES = [
  "NO_IMAGE",
  "CONTENT_INCOMPLETE",
  "NO_WEIGHT_LOCAL",
  "COST_MISSING",
  "COST_ESTIMATED",
  "OUT_OF_STOCK",
  "STOCK_OTHER_WAREHOUSE",
  "PRICE_STALE",
  "RATE_NEWER",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export type WarningCode = (typeof WARNING_CODES)[number];
export type IssueCode = ErrorCode | WarningCode;
/** `skus`: biến thể liên quan (nếu lỗi theo biến thể). */
export type Issue = { code: IssueCode; skus?: string[] };

/** Lỗi vẫn chặn khi lưu SP ĐANG hiển thị (các lỗi khác chỉ chặn lúc bật hiển thị). */
export const ALWAYS_BLOCKING: readonly ErrorCode[] = ["NO_ACTIVE_VARIANT", "PRICE_ZERO"];

export type ReadinessInput = {
  /** null = SP chưa có kho bán (chưa nhập hàng — kho gán khi ghi sổ nhập đầu tiên). */
  location: { active: boolean; sellable: boolean; pricingMode: "VN_IMPORT" | "LOCAL_MMK" | null } | null;
  imageCount: number;
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
    /** Combo có thành phần đã tắt / ngừng kinh doanh (#6). */
    inactiveComponent?: boolean;
  }[];
  /** Khả dụng bán theo biến thể (đã trừ giữ hàng, hạn, kho của SP). */
  available: Map<string, number>;
  /** SKU có tồn bán được nhưng lô thiếu giá vốn / đang dùng vốn tạm / tồn nằm ở kho bán khác. */
  costMissingSkus: string[];
  costEstimatedSkus: string[];
  otherWarehouseSkus: string[];
  /** QT1b: có phiếu nhập ghi sổ sau lần đổi giá gần nhất (combo: của thành phần) → nên tính lại giá. */
  staleSkus?: string[];
  /** P1-D (M5): kho nhập VN — có tỷ giá mới hơn lần đổi giá gần nhất → nên tính lại giá (bảng tính giá). */
  rateNewerSkus?: string[];
  /** QT3: hết hàng vẫn nhận đặt trước → không cảnh báo hết hàng. Bỏ trống = không nhận (như trước QT3). */
  preorderEnabled?: boolean;
};

export type Readiness = { errors: Issue[]; warnings: Issue[] };

const withSkus = (code: IssueCode, skus: string[]): Issue[] => (skus.length ? [{ code, skus }] : []);

/**
 * Thiếu khối lượng là LỖI chặn chỉ khi công thức giá tự động cần nó (cước/kg của kho nhập VN). Giá tự động đang tắt
 * (`FEATURES.autoPricing`, 18/11/2026) hoặc kho mua MMK → chỉ cảnh báo NO_WEIGHT_LOCAL (vẫn cần khi gửi VTP).
 * Ngoại lệ có chủ ý (như `fefo.ts` với cờ hạn dùng): cờ đổi quy tắc nghiệp vụ nên hàm thuần kiểm cờ.
 * Dùng chung cho readiness và Kiểm tra dữ liệu (`reports/data-health.ts`).
 */
export const weightRequired = (pricingMode: "VN_IMPORT" | "LOCAL_MMK" | null | undefined): boolean =>
  FEATURES.autoPricing && pricingMode !== "LOCAL_MMK";

export function evaluateReadiness(p: ReadinessInput): Readiness {
  const active = p.variants.filter((v) => v.active);
  const hasWeight = (v: ReadinessInput["variants"][number]) =>
    (v.weightGrams ?? 0) > 0 ||
    (v.isBundle && !!v.componentWeights?.length && v.componentWeights.every((w) => (w ?? 0) > 0));
  const noWeight = active.filter((v) => !hasWeight(v)).map((v) => v.sku);
  const needWeight = weightRequired(p.location?.pricingMode);

  const errors: Issue[] = [
    ...(active.length === 0 ? [{ code: "NO_ACTIVE_VARIANT" as const }] : []),
    ...(!p.location ? [{ code: "NO_WAREHOUSE" as const }] : !p.location.active || !p.location.sellable ? [{ code: "BAD_LOCATION" as const }] : []),
    ...withSkus("PRICE_ZERO", active.filter((v) => v.priceMmk <= 0).map((v) => v.sku)),
    // Kho hàng nhập VN + giá tự động bật: công thức giá cần khối lượng (combo chưa khai báo → cộng thành phần).
    ...(needWeight ? withSkus("NO_WEIGHT", noWeight) : []),
    ...withSkus("COMPONENT_INACTIVE", active.filter((v) => v.inactiveComponent).map((v) => v.sku)),
  ];
  const warnings: Issue[] = [
    ...(p.imageCount === 0 ? [{ code: "NO_IMAGE" as const }] : []),
    ...(p.content.some((c) => !c.description?.trim()) ? [{ code: "CONTENT_INCOMPLETE" as const }] : []),
    ...(needWeight ? [] : withSkus("NO_WEIGHT_LOCAL", noWeight)),
    ...withSkus("COST_MISSING", p.costMissingSkus),
    ...withSkus("COST_ESTIMATED", p.costEstimatedSkus),
    ...(!p.preorderEnabled && active.length > 0 && active.every((v) => (p.available.get(v.id) ?? 0) <= 0) ? [{ code: "OUT_OF_STOCK" as const }] : []),
    ...withSkus("STOCK_OTHER_WAREHOUSE", p.otherWarehouseSkus),
    ...withSkus("PRICE_STALE", p.staleSkus ?? []),
    ...withSkus("RATE_NEWER", p.rateNewerSkus ?? []),
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

/** Cổng đăng bán (P1-A): đủ điều kiện mở bán + bản live đã được duyệt. Dùng chung cho mọi đường bật hiển thị. */
export function publishBlockers(r: Readiness, p: { approved: boolean }): Issue[] {
  return [...r.errors, ...(p.approved ? [] : [{ code: "NOT_APPROVED" as const }])];
}

export type ListStatus = "ARCHIVED" | "PUBLISHED" | "READY" | "INCOMPLETE";
export function listStatus(p: { archived: boolean; published: boolean }, r: Readiness): ListStatus {
  if (p.archived) return "ARCHIVED";
  if (p.published) return "PUBLISHED";
  return r.errors.length ? "INCOMPLETE" : "READY";
}

/**
 * Quy trình 5 bước (docs/ke-hoach-quy-trinh-san-pham.md): 1 Tạo → 2 Nhập kho + giá vốn → 3 Giá bán → 4 Duyệt → 5 Đăng bán.
 * Mỗi lỗi/cảnh báo D2 thuộc về một bước; bước 2 còn cần mọi biến thể (hoặc thành phần combo) có phiếu nhập đã ghi sổ.
 * `current` = bước đầu tiên còn "todo" (cảnh báo không chặn tiến trình); null khi đã đăng bán và không còn việc.
 * Bước 4 (QT2): "chờ" khi các bước trước còn lỗi; "cần làm" khi chỉ còn thiếu duyệt; "xong" khi đã duyệt.
 */
export const PRODUCT_STEPS = ["create", "stock", "price", "review", "publish"] as const;
export type ProductStep = (typeof PRODUCT_STEPS)[number];
export type StepState = "done" | "warn" | "todo" | "waiting";
export type StepView = { key: ProductStep; state: StepState; issues: Issue[] };

const STEP_OF: Record<IssueCode, ProductStep> = {
  NO_ACTIVE_VARIANT: "create",
  BAD_LOCATION: "create",
  NO_WAREHOUSE: "stock",
  NO_IMAGE: "create",
  CONTENT_INCOMPLETE: "create",
  COMPONENT_INACTIVE: "create",
  NO_WEIGHT: "stock",
  NO_WEIGHT_LOCAL: "stock",
  COST_MISSING: "stock",
  COST_ESTIMATED: "stock",
  OUT_OF_STOCK: "stock",
  STOCK_OTHER_WAREHOUSE: "stock",
  PRICE_ZERO: "price",
  PRICE_STALE: "price",
  RATE_NEWER: "price",
  NOT_APPROVED: "review",
};

export function productSteps(
  /** `approved`: bản live đã duyệt và không có bản đang sửa chờ xử lý (bỏ trống = đã duyệt). */
  p: { published: boolean; notReceivedSkus: string[]; approved?: boolean; preorderEnabled?: boolean },
  r: Readiness,
): { steps: StepView[]; current: ProductStep | null } {
  const of = (step: ProductStep, list: Issue[]) => list.filter((i) => STEP_OF[i.code] === step);
  const state = (errors: Issue[], warnings: Issue[], extraTodo = false): StepState =>
    errors.length || extraTodo ? "todo" : warnings.length ? "warn" : "done";
  const ready = r.errors.length === 0;
  const steps: StepView[] = (["create", "stock", "price"] as const).map((key) => {
    const errors = of(key, r.errors);
    const warnings = of(key, r.warnings);
    // Bước 2 "Kho bán & hàng" (19/11/2026) có hai nhánh hợp lệ: đã nhập hàng, hoặc BÁN ĐẶT TRƯỚC (đã có kho — thiếu kho là
    // lỗi NO_WAREHOUSE — và đang bật đặt trước). Chưa nhập hàng mà tắt đặt trước → không bán được → còn phải nhập hàng.
    const notReceived = key === "stock" && p.notReceivedSkus.length > 0 && !p.preorderEnabled;
    return {
      key,
      state: state(errors, warnings, notReceived),
      issues: [...errors, ...warnings],
    };
  });
  const approved = p.approved ?? true;
  const review: Issue[] = approved ? [] : [{ code: "NOT_APPROVED" }];
  steps.push({ key: "review", state: !ready ? "waiting" : approved ? "done" : "todo", issues: review });
  steps.push({ key: "publish", state: p.published ? "done" : ready && approved ? "todo" : "waiting", issues: [] });
  return { steps, current: steps.find((s) => s.state === "todo")?.key ?? null };
}

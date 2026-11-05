import carrier from "./templates/vtp-options.json";
import locations from "../../../prisma/data/vtp-myanmar-addresses.json";

export const VTP_OPTIONS = { services: carrier.services, pickupTimes: carrier.pickupTimes };
export type VtpAddress = { key: string; state: string; district: string; township: string; label: string };
export const VTP_ADDRESSES: VtpAddress[] = carrier.townships.flatMap((township) =>
  carrier.districts.filter((d) => d.code === township.district).flatMap((district) =>
    carrier.states.filter((s) => s.code === district.state).map((state) => ({
      key: `${state.code}|${district.code}|${township.code}`,
      state: state.label, district: district.label, township: township.label,
      label: `${state.label} / ${district.label} / ${township.label}`,
    })),
  ),
);
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const labelName = (s: string) => s.slice(s.indexOf("-") + 1).trim();
const stateName = (s: string) => normalize(s).replace(/^(eastern|western|northern|southern|east|west|north|south)/, "");

/** Match names within their state; never match ambiguous township codes globally. */
export function resolveVtpAddress(order: { stateCode: string | null; districtCode: string | null; townshipCode: string | null }): VtpAddress | null {
  const state = locations.find((s) => s.code === order.stateCode);
  const district = state?.districts.find((d) => d.code === order.districtCode);
  const township = district?.townships.find((t) => t.code === order.townshipCode);
  if (!state || !district || !township) return null;
  const candidates = VTP_ADDRESSES.filter((a) => stateName(labelName(a.state)) === stateName(state.nameEn) && normalize(labelName(a.township)) === normalize(township.nameEn));
  const exact = candidates.filter((a) => normalize(labelName(a.district)) === normalize(district.nameEn));
  return exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;
}

export type VtpSourceOrder = {
  id: string; code: string; recipientName: string; recipientPhone: string; recipientPhone2: string | null;
  addressText: string; zoneName: string; stateCode: string | null; districtCode: string | null; townshipCode: string | null;
  paymentMethod: string; paymentStatus: string; subtotalMmk: number; totalMmk: number; note: string | null;
  shippingPayer?: "RECEIVER" | "SENDER";
  items: { sku: string; name: string; qty: number; variant: { weightGrams: number | null } }[];
};
export type VtpPreview = ReturnType<typeof vtpPreview>;
export function vtpPreview(order: VtpSourceOrder) {
  const missingWeights = order.items.filter((i) => !i.variant.weightGrams || i.variant.weightGrams <= 0).map((i) => i.sku);
  return {
    id: order.id, code: order.code, recipientName: order.recipientName, phone: order.recipientPhone,
    phone2: order.recipientPhone2 ?? "", addressText: order.addressText, zoneName: order.zoneName,
    address: resolveVtpAddress(order),
    goods: order.items.map((i) => `${i.qty} x ${i.name}`).join("; "),
    weightGrams: missingWeights.length ? null : order.items.reduce((sum, i) => sum + (i.variant.weightGrams ?? 0) * i.qty, 0),
    missingWeights,
    valueMmk: order.subtotalMmk,
    chargePayer: order.shippingPayer === "SENDER" ? "Sender" as const : "Receiver" as const,
    codMmk: order.paymentMethod === "COD" && order.paymentStatus !== "PAID" ? order.totalMmk : 0,
    note: [order.recipientPhone2 ? `Phone 2: ${order.recipientPhone2}` : "", order.note ?? ""].filter(Boolean).join("; "),
  };
}

export type VtpRowOptions = { weightGrams: number; addressKey: string; recipientName: string; note: string; service: string; chargePayer: string; pickupTime: string };
export function vtpRow(order: VtpSourceOrder, options: VtpRowOptions, index: number): (string | number)[] {
  const preview = vtpPreview(order);
  const chargePayer = options.chargePayer === "Order" ? preview.chargePayer : options.chargePayer;
  const address = VTP_ADDRESSES.find((a) => a.key === options.addressKey);
  if (!address) throw new Error(`${order.code}: chọn đủ địa chỉ VTP.`);
  if (!carrier.services.includes(options.service)) throw new Error("Chọn dịch vụ có trong mẫu VTP.");
  if (!["Sender", "Receiver"].includes(chargePayer)) throw new Error("Người trả cước không hợp lệ.");
  if (options.pickupTime && !carrier.pickupTimes.includes(options.pickupTime)) throw new Error("Thời gian hẹn lấy không hợp lệ.");
  if (!Number.isInteger(options.weightGrams) || options.weightGrams <= 0 || options.weightGrams > 2147483647) throw new Error(`${order.code}: khối lượng phải là số nguyên dương, tính bằng gram.`);
  const name = options.recipientName.trim();
  if (!name || [...name].length > 50) throw new Error(`${order.code}: tên người nhận phải từ 1 đến 50 ký tự theo mẫu VTP.`);
  if ([...options.note].length > 150) throw new Error(`${order.code}: ghi chú tối đa 150 ký tự theo mẫu VTP.`);
  if (!preview.phone || preview.phone.length > 20 || !preview.addressText || !preview.goods) throw new Error(`${order.code}: thiếu hoặc sai thông tin người nhận/hàng hóa.`);
  return [index + 1, order.code, name, preview.phone, address.state, address.district, address.township,
    preview.addressText, preview.goods, options.weightGrams, preview.valueMmk, preview.codMmk,
    "Goods", options.service, "", "", "", "", chargePayer, options.pickupTime, options.note];
}

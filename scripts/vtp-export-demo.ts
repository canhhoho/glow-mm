/** Fictional records to verify the production exporter without connecting to a database. */
import { mkdir, writeFile } from "node:fs/promises";
import { createVtpWorkbook } from "../src/server/orders/vtp-workbook";
import { resolveVtpAddress, vtpRow, type VtpSourceOrder } from "../src/server/orders/vtp-data";
const order: VtpSourceOrder = {
  id: "demo", code: "DEMO-VTP-001", recipientName: "Demo Customer", recipientPhone: "0978000000", recipientPhone2: null,
  addressText: "DEMO - No. 7, Pyay Road", zoneName: "Kamaryut, Yangon (West), Yangon", stateCode: "YGN", districtCode: "WYG", townshipCode: "KMY",
  paymentMethod: "COD", paymentStatus: "UNPAID", subtotalMmk: 50000, totalMmk: 50000, note: "DEMO ONLY - do not create shipment",
  items: [{ sku: "DEMO-SUN-50", name: "Sunscreen 50 ml", qty: 2, variant: { weightGrams: 80 } }],
};
const options = { weightGrams: 200, addressKey: resolveVtpAddress(order)!.key, recipientName: order.recipientName, note: order.note!, service: "VNM - Normal Intra City", chargePayer: "Receiver", pickupTime: "" };
async function main() {
  await mkdir("outputs/vtp-export", { recursive: true });
  await writeFile("outputs/vtp-export/VTP-demo.xlsx", await createVtpWorkbook([
    vtpRow(order, options, 0),
    vtpRow({ ...order, code: "DEMO-VTP-002", paymentMethod: "BANK_TRANSFER", paymentStatus: "PAID" }, options, 1),
  ]));
  console.log("Created outputs/vtp-export/VTP-demo.xlsx with two fictional orders (COD and prepaid).");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

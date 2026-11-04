"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { DocType } from "@/generated/prisma/client";
import { requirePermission } from "@/server/auth/session";
import type { Permission } from "@/server/auth/roles";
import { cancelDocument, createDocument, postDocument, resolveBatchExpiry } from "./documents";
import { discardFromQuarantine, restockFromQuarantine } from "./quarantine";
import {
  addShipmentCost,
  allocateShipment,
  createShipment,
  markShipmentArrived,
  removeShipmentCost,
  setAllocationMethod,
} from "./shipments";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function resolveBatchExpiryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("stock:receive");
    await resolveBatchExpiry(Object.fromEntries(formData), user.id);
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/batches/${String(formData.get("batchId"))}`);
    revalidatePath("/admin/alerts");
    return { ok: "saved" };
  } catch (e) { return { error: message(e) }; }
}

const DOC_PERMISSION: Record<DocType, Permission> = {
  RECEIVE: "stock:receive",
  TRANSFER: "stock:transfer",
  ISSUE: "stock:issue",
  ADJUST: "stock:adjust",
  RETURN: "orders:return",
};

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  if (e instanceof Error) return e.message;
  return String(e);
}

/** payload = JSON của phiếu (từ form nhiều dòng). */
export async function createDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const payload = JSON.parse(String(formData.get("payload") ?? "{}"));
    const type = payload?.type as DocType;
    if (!DOC_PERMISSION[type]) return { error: "Loại phiếu không hợp lệ" };
    const user = await requirePermission(DOC_PERMISSION[type]);
    id = (await createDocument(payload, user.id)).id;
  } catch (e) {
    return { error: message(e) };
  }
  redirect(`/admin/inventory/documents/${id}`);
}

async function permissionForDoc(documentId: string): Promise<Permission> {
  const { prisma } = await import("@/lib/db");
  const doc = await prisma.stockDocument.findUniqueOrThrow({ where: { id: documentId }, select: { type: true } });
  return DOC_PERMISSION[doc.type];
}

export async function postDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id"));
  try {
    const user = await requirePermission(await permissionForDoc(id));
    await postDocument(id, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/admin/inventory/documents/${id}`);
  return { ok: "posted" };
}

export async function cancelDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id"));
  try {
    const user = await requirePermission(await permissionForDoc(id));
    await cancelDocument(id, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/admin/inventory/documents/${id}`);
  return { ok: "cancelled" };
}

// ── Chuyến hàng ──

export async function createShipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    await requirePermission("shipment:manage");
    id = (
      await createShipment({
        code: formData.get("code"),
        allocationMethod: formData.get("allocationMethod") || undefined,
        departedAt: formData.get("departedAt") || undefined,
        note: formData.get("note") || undefined,
      })
    ).id;
  } catch (e) {
    return { error: message(e) };
  }
  redirect(`/admin/shipments/${id}`);
}

export async function addShipmentCostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const shipmentId = String(formData.get("shipmentId"));
  try {
    await requirePermission("shipment:manage");
    await addShipmentCost({
      shipmentId,
      type: formData.get("type"),
      amountVnd: formData.get("amountVnd"),
      note: formData.get("note") || undefined,
    });
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/admin/shipments/${shipmentId}`);
  return { ok: "added" };
}

export async function removeShipmentCostAction(formData: FormData) {
  await requirePermission("shipment:manage");
  const shipmentId = String(formData.get("shipmentId"));
  await removeShipmentCost(String(formData.get("costId")));
  revalidatePath(`/admin/shipments/${shipmentId}`);
}

export async function allocateShipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const shipmentId = String(formData.get("shipmentId"));
  try {
    const user = await requirePermission("shipment:manage");
    const method = formData.get("allocationMethod");
    if (method === "BY_VALUE" || method === "BY_QTY") await setAllocationMethod(shipmentId, method);
    await allocateShipment(shipmentId, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/admin/shipments/${shipmentId}`);
  return { ok: "allocated" };
}

// ── Khu Chờ kiểm tra (hàng trả) ──

const quarantineFields = (fd: FormData) => ({
  batchId: fd.get("batchId"),
  fromId: fd.get("fromId"),
  qty: fd.get("qty"),
  stockType: fd.get("stockType") || undefined,
});

export async function restockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("stock:transfer");
    await restockFromQuarantine({ ...quarantineFields(formData), toId: formData.get("toId") }, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/admin/inventory/quarantine");
  return { ok: "restocked" };
}

export async function discardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("stock:issue");
    await discardFromQuarantine({ ...quarantineFields(formData), reason: formData.get("reason") }, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/admin/inventory/quarantine");
  return { ok: "discarded" };
}

export async function markArrivedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const shipmentId = String(formData.get("shipmentId"));
  try {
    const user = await requirePermission("shipment:manage");
    await markShipmentArrived(shipmentId, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/admin/shipments/${shipmentId}`);
  revalidatePath("/admin/shipments");
  return { ok: "arrived" };
}

import { storage } from "@/server/adapters/storage";

/** Phục vụ file khi STORAGE_DRIVER=local. Biên lai chuyển khoản sẽ được kiểm tra quyền ở P2. */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const { key } = await ctx.params;
  const s = await storage();
  try {
    const file = await s.get(key.join("/"));
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}

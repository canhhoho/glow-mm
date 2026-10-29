import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@/lib/brand";

/** Web app manifest (PWA): cài lên màn hình chính. Icon sinh bằng scripts/generate-icons.mjs. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND_NAME} — ဗီယက်နမ် အလှကုန်`,
    short_name: BRAND_NAME,
    description: "ဗီယက်နမ်မှ တိုက်ရိုက် အရည်အသွေးစစ် အလှကုန်",
    lang: "my",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fff8f5",
    theme_color: "#e8657a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

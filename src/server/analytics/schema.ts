import { z } from "zod";
import { ANALYTICS_PATHS, CLIENT_EVENTS, PAGE_TYPES } from "@/lib/analytics-events";

export const analyticsContextSchema = z.object({ sessionId: z.uuid(), device: z.enum(["mobile", "desktop"]) }).strict();
const props = z.object({ metric: z.enum(["LCP", "INP", "CLS"]).optional(), value: z.number().finite().min(0).max(3600000).optional(), pageType: z.enum(PAGE_TYPES).optional() }).strict();
export const clientEventSchema = analyticsContextSchema.extend({
  eventId: z.uuid(), name: z.enum(CLIENT_EVENTS), locale: z.enum(["my", "en", "vi"]).optional(), path: z.enum(ANALYTICS_PATHS), props: props.optional(),
}).strict().superRefine((event, ctx) => {
  if (event.name === "web_vital" && (event.props?.metric == null || event.props.value == null || event.props.pageType == null)) {
    ctx.addIssue({ code: "custom", message: "Missing vital measurement", path: ["props"] });
  }
  if (event.name !== "web_vital" && event.props != null) ctx.addIssue({ code: "custom", message: "Unexpected event properties", path: ["props"] });
  if (event.props && new TextEncoder().encode(JSON.stringify(event.props)).length > 2048) ctx.addIssue({ code: "custom", message: "Event properties too large", path: ["props"] });
});

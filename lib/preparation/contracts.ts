import { z } from "zod";
export const Field = z.object({
    id: z.string().min(1).max(1000), label: z.string().max(2000), help: z.string().max(2000),
    type: z.enum(["text", "textarea", "email", "tel", "url", "number", "date", "select", "radio", "checkbox", "file", "unsupported"]),
    required: z.boolean(), actionable: z.boolean(), section: z.string().max(500),
    options: z.array(z.object({ label: z.string().max(500), value: z.string().max(500) })).max(200),
    maxLength: z.number().int().min(-1), pattern: z.string().max(500),
    min: z.string().max(100).optional(), max: z.string().max(100).optional(), step: z.string().max(100).optional(),
    manualReason: z.string().max(500).optional(),
});
export const Capture = z.object({ url: z.string().url().max(2000), jobId: z.string().min(1).max(2000), title: z.string().max(300).optional(), warnings: z.array(z.string().max(500)).max(100).optional(), fields: z.array(Field).max(200) }).strict();
export type Captured = z.infer<typeof Capture>;
export type Question = z.infer<typeof Field>;
export const Result = z.object({ id: z.string(), code: z.enum(["filled_verified", "skipped_user_value", "approval_needed", "stale_schema", "ambiguous_locator", "option_missing", "validation_error", "unsupported", "manual_upload_required"]) }).strict();
export const Command = z.discriminatedUnion("action", [
    z.object({ action: z.literal("capture"), capture: Capture }),
    z.object({ action: z.literal("draft"), revision: z.number().int(), id: z.string(), value: z.string().max(20000) }),
    z.object({ action: z.literal("approve"), revision: z.number().int(), id: z.string() }),
    z.object({ action: z.literal("coach"), revision: z.number().int(), id: z.string() }),
    z.object({ action: z.literal("plan"), revision: z.number().int() }),
    z.object({ action: z.literal("results"), planId: z.string(), results: z.array(Result).max(200) }),
    z.object({ action: z.literal("reset") }),
]);
export type Answer = {
    id: string;
    value: string;
    state: "draft" | "approved";
    version: number;
    schema: string;
    context?: string;
};
export type Plan = {
    id: string;
    schema: string;
    url: string;
    revision: number;
    expires: number;
    fields: Array<{
        field: Question;
        answer: Answer;
    }>;
};
export type Workspace = {
    revision: number;
    capture?: Captured;
    schema?: string;
    answers: Answer[];
    plans: Plan[];
    events: Array<{
        id: string;
        results: z.infer<typeof Result>[];
    }>;
};

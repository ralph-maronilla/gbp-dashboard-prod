import { z } from "zod";
import { uuidSchema } from "./common";
import { REGION_CODES } from "@/lib/ph-regions";

export const BRANCH_PREFIX_MAX = 30;
export const locationIdParamsSchema = z.object({ id: uuidSchema });
const branchPrefixSchema = z
  .string()
  .trim()
  .max(BRANCH_PREFIX_MAX)
  .regex(/^[A-Za-z0-9 _.\/-]*$/, "Use letters, numbers, spaces and - _ . /")
  .nullable()
  .transform((v) => (v ? v : null));

export const LABEL_MAX = 50;
/** Type suggestions; any text up to LABEL_MAX is accepted. */
export const TYPE_SUGGESTIONS = ["Hospital", "Outpatient Center", "Specialty Center", "Diagnostic Center"];
const labelSchema = z
  .string()
  .max(200)
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .refine((v) => v.length <= LABEL_MAX, `Use at most ${LABEL_MAX} characters`)
  .nullable()
  .transform((v) => (v ? v : null));

/** Admin edits to a location. Empty branch prefix clears it (the export then falls back to the location name). */
export const updateLocationSchema = z
  .object({
    branch_prefix: branchPrefixSchema.optional(),
    is_active: z.boolean().optional(),
    name: z
      .string()
      .min(1)
      .max(200)
      .transform((n) => n.replace(/\s+/g, " ").trim())
      .refine((n) => n.length > 0, "Name is required")
      .optional(),
    address: z.string().trim().max(300).nullable().optional(),
    /** Dashboard grouping; empty clears it. */
    region: z.enum(REGION_CODES as [string, ...string[]]).nullable().optional(),
    location_type: labelSchema.optional(),
    /** Replaces the location's clients (groups). Omit to leave them as they are; [] removes it from all. */
    group_ids: z.array(uuidSchema).max(200).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });
export type UpdateLocationInput = z.input<typeof updateLocationSchema>;

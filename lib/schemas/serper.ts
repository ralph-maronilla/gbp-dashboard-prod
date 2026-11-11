import { z } from "zod";
import { uuidSchema } from "./common";

export const addLocationsSchema = z.object({
  items: z
    .array(
      z.object({
        /** Google Maps link or CID as pasted. */
        input: z.string().trim().min(1).max(2000),
        name: z.string().trim().max(200).optional(),
        address: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(500),
  /** Client the locations belong to: an existing group, or a new name (created if missing). */
  group_id: uuidSchema.optional(),
  client_name: z.string().trim().min(1).max(100).optional(),
});
export type AddLocationsInput = z.infer<typeof addLocationsSchema>;

export interface AddLocationsResult {
  added: number;
  already_added: number;
  /** Not a recognisable Maps link or CID (place IDs are rejected). */
  invalid: string[];
  /** Added under a different name because the wanted one is taken by another location. */
  renamed: { from: string; to: string }[];
}

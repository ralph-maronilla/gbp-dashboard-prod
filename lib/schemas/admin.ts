import { z } from "zod";
import { roleSchema, statusSchema, uuidSchema, type Role } from "./common";

export const userIdParamsSchema = z.object({ id: uuidSchema });

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: statusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const updateUserSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("set_role"), role: roleSchema }),
]);
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setUserLocationsSchema = z.object({
  location_ids: z.array(uuidSchema).max(1000),
  group_ids: z.array(uuidSchema).max(200),
});
export type SetUserLocationsInput = z.infer<typeof setUserLocationsSchema>;

export const adminUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  full_name: z.string().nullable(),
  role: roleSchema,
  status: statusSchema,
  created_at: z.string(),
  approved_at: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  last_path: z.string().nullable(),
  /** Serper credits this person spent (Extract and Google refresh): today (UTC day) and in the last 30 days. */
  credits_today: z.number(),
  credits_30d: z.number(),
  location_ids: z.array(uuidSchema),
  group_ids: z.array(uuidSchema),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export interface AssignableOptions {
  locations: { id: string; name: string }[];
  groups: { id: string; name: string }[];
}

export const heartbeatSchema = z.object({ path: z.string().min(1).max(200).startsWith("/") });
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

export interface OnlineUser {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  last_seen_at: string;
  last_path: string | null;
}

import { z } from "zod";

export const ROLES = ["admin", "manager", "viewer"] as const;
export const STATUSES = ["pending", "approved", "rejected"] as const;

export const roleSchema = z.enum(ROLES);
export const statusSchema = z.enum(STATUSES);
export type Role = z.infer<typeof roleSchema>;
export type Status = z.infer<typeof statusSchema>;

export const uuidSchema = z.string().uuid();

export const profileSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  full_name: z.string().nullable(),
  role: roleSchema,
  status: statusSchema,
});
export type Profile = z.infer<typeof profileSchema>;

import { z } from "zod";

// bcrypt only reads the first 72 bytes, so a longer password would be silently cut: reject it instead.
const passwordRule = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72)
  .refine((p) => new TextEncoder().encode(p).length <= 72, "Password is too long");

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordRule,
  full_name: z.string().trim().min(1).max(100).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** `token` comes from the link in the reset email. */
export const resetPasswordSchema = z.object({ token: z.string().min(1).max(200), password: passwordRule });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

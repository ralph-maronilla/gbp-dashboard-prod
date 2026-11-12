import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { ROLES } from "@/lib/schemas/common";
import { signOut } from "@/server/auth/service";

export const POST = withAuth(
  { roles: [ROLES[0], ROLES[1], ROLES[2]], requireApproved: false },
  async ({ req }) => {
    await signOut(req.headers);
    return ok({ ok: true });
  },
);

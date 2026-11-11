import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { ROLES } from "@/lib/schemas/common";

// Pending/rejected users may read their own profile so the UI can route them correctly.
export const GET = withAuth(
  { roles: [ROLES[0], ROLES[1], ROLES[2]], requireApproved: false },
  async ({ ctx }) => ok(ctx.profile),
);

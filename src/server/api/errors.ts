export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "NOT_APPROVED"
  | "FORBIDDEN"
  | "CSRF"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "EMAIL_NOT_CONFIRMED"
  | "INTERNAL";

/** Thrown inside handlers; the wrapper turns it into the standard error response. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const Errors = {
  badRequest: (message = "Bad request") => new ApiError(400, "BAD_REQUEST", message),
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "Authentication required"),
  notApproved: () => new ApiError(403, "NOT_APPROVED", "Your account is not approved"),
  forbidden: () => new ApiError(403, "FORBIDDEN", "You do not have access to this resource"),
  notFound: () => new ApiError(404, "NOT_FOUND", "Not found"),
  conflict: (message: string) => new ApiError(409, "CONFLICT", message),
};

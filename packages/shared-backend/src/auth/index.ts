export {
  createBetterAuth,
  parseTrustedOrigins,
  type BetterAuthLike,
  type BetterAuthSessionResult,
  type BetterAuthSessionState,
  type BetterAuthSessionUser,
  type CreateBetterAuthOptions,
  type SendVerificationEmail,
} from './auth-config'
export {
  createAuthRateLimitMiddleware,
  type AuthRateLimiter,
  type AuthRateLimiters,
} from './auth-rate-limit'
export {
  registerAuthController,
  type AuthControllerOptions,
} from './auth-controller'
export {
  createAuthSessionMiddleware,
  getAccountSessionFromAuthContext,
  getAuthSessionFromContext,
  getAuthUserFromContext,
  isAuthConfigured,
  type AuthSessionMiddlewareOptions,
} from './auth-middleware'
export { requireAdmin } from './require-admin'

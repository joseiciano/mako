import { describe, expect, it } from 'vitest'
import { getRouter } from '#/router'
import { Route as AuthenticatedRoute } from '../_authenticated'
import { Route as BillingRoute } from '../_authenticated.billing'

describe('billing auth route integration', function () {
  it('keeps billing under the authenticated route guard chain', function () {
    const router = getRouter()
    const billingRoute = router.routesById['/_authenticated/billing']

    expect(billingRoute.id).toBe('/_authenticated/billing')
    expect(billingRoute.parentRoute.id).toBe('/_authenticated')
    expect(typeof billingRoute.parentRoute.options.beforeLoad).toBe('function')
  })

  it('does not define a billing-specific auth guard', function () {
    const router = getRouter()
    const billingRoute = router.routesById['/_authenticated/billing']
    const authenticatedRoute = router.routesById['/_authenticated']

    expect(BillingRoute.options.beforeLoad).toBeUndefined()
    expect(billingRoute.options.beforeLoad).toBeUndefined()
    expect(billingRoute.parentRoute.id).toBe(authenticatedRoute.id)
    expect(billingRoute.parentRoute.options.beforeLoad).toBe(
      authenticatedRoute.options.beforeLoad,
    )

    const authenticatedBeforeLoad = AuthenticatedRoute.options.beforeLoad
    expect(typeof authenticatedBeforeLoad).toBe('function')
  })
})

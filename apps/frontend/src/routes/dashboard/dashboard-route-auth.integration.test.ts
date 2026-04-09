import { describe, expect, it } from 'vitest'
import { getRouter } from '#/router'
import { Route as AuthenticatedRoute } from '../_authenticated'
import { Route as DashboardRoute } from '../_authenticated.dashboard'

describe('dashboard auth route integration', function () {
  it('keeps dashboard under the authenticated route guard chain', function () {
    const router = getRouter()
    const dashboardRoute = router.routesById['/_authenticated/dashboard']

    expect(dashboardRoute.id).toBe('/_authenticated/dashboard')
    expect(dashboardRoute.parentRoute.id).toBe('/_authenticated')
    expect(typeof dashboardRoute.parentRoute.options.beforeLoad).toBe('function')
  })

  it('does not define a dashboard-specific auth guard', function () {
    const router = getRouter()
    const dashboardRoute = router.routesById['/_authenticated/dashboard']
    const authenticatedRoute = router.routesById['/_authenticated']

    expect(DashboardRoute.options.beforeLoad).toBeUndefined()
    expect(dashboardRoute.options.beforeLoad).toBeUndefined()
    expect(dashboardRoute.parentRoute.id).toBe(authenticatedRoute.id)
    expect(dashboardRoute.parentRoute.options.beforeLoad).toBe(
      authenticatedRoute.options.beforeLoad,
    )

    const authenticatedBeforeLoad = AuthenticatedRoute.options.beforeLoad
    expect(typeof authenticatedBeforeLoad).toBe('function')
  })
})

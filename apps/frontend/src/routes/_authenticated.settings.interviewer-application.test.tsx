import { describe, expect, it } from 'vitest'
import { routeTree } from '../routeTree.gen'
import { Route } from './_authenticated.settings.interviewer-application'
import { Route as AuthenticatedRoute } from './_authenticated'

function pathOf(route: { options: unknown }) {
  return (route.options as { path?: string }).path
}

describe('interviewer application route', function suite() {
  it('lives at /settings/interviewer-application beneath the authenticated layout', function run() {
    expect(routeTree).toBeDefined()
    const settingsRoute = Route.options.getParentRoute()
    expect(pathOf(Route)).toBe('/interviewer-application')
    expect(pathOf(settingsRoute)).toBe('/settings')
    expect(settingsRoute.options.getParentRoute()).toBe(AuthenticatedRoute)
  })

  it('inherits the authenticated guard that redirects unauthenticated users to login', function run() {
    const settingsRoute = Route.options.getParentRoute()
    expect(settingsRoute.options.getParentRoute()).toBe(AuthenticatedRoute)
    expect(AuthenticatedRoute.options.beforeLoad).toBeTypeOf('function')
  })
})

import { describe, expect, it } from 'vitest'
import { getRouter } from '#/router'
import { Route as AuthenticatedRoute } from '../_authenticated'
import { Route as InterviewsRoute } from '../_authenticated.interviews'
import { Route as InterviewsNewRoute } from '../_authenticated.interviews.new'

describe('interviews auth route integration', function () {
  it('keeps interviews under the authenticated route guard chain', function () {
    const router = getRouter()
    const interviewsRoute = router.routesById['/_authenticated/interviews']

    expect(interviewsRoute.id).toBe('/_authenticated/interviews')
    expect(interviewsRoute.parentRoute.id).toBe('/_authenticated')
    expect(typeof interviewsRoute.parentRoute.options.beforeLoad).toBe('function')
  })

  it('keeps interviews/new under the authenticated route guard chain', function () {
    const router = getRouter()
    const interviewsNewRoute =
      router.routesById['/_authenticated/interviews/new']

    expect(interviewsNewRoute.id).toBe('/_authenticated/interviews/new')
    expect(interviewsNewRoute.parentRoute.id).toBe('/_authenticated/interviews')
    expect(interviewsNewRoute.parentRoute.parentRoute.id).toBe('/_authenticated')
    expect(typeof interviewsNewRoute.parentRoute.parentRoute.options.beforeLoad).toBe(
      'function',
    )
  })

  it('does not define interviews-specific auth guards', function () {
    const router = getRouter()
    const interviewsRoute = router.routesById['/_authenticated/interviews']
    const interviewsNewRoute =
      router.routesById['/_authenticated/interviews/new']
    const authenticatedRoute = router.routesById['/_authenticated']

    expect(InterviewsRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsRoute.parentRoute.id).toBe(authenticatedRoute.id)
    expect(interviewsRoute.parentRoute.options.beforeLoad).toBe(
      authenticatedRoute.options.beforeLoad,
    )

    expect(InterviewsNewRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsNewRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsNewRoute.parentRoute.id).toBe(interviewsRoute.id)
    expect(interviewsNewRoute.parentRoute.parentRoute.id).toBe(authenticatedRoute.id)
    expect(interviewsNewRoute.parentRoute.parentRoute.options.beforeLoad).toBe(
      authenticatedRoute.options.beforeLoad,
    )

    const authenticatedBeforeLoad = AuthenticatedRoute.options.beforeLoad
    expect(typeof authenticatedBeforeLoad).toBe('function')
  })
})

import { describe, expect, it } from 'vitest'
import { getRouter } from '#/router'
import { Route as AuthenticatedRoute } from '../_authenticated'
import { Route as InterviewsRoute } from '../_authenticated.interviews'
import { Route as InterviewsNewRoute } from '../_authenticated.interviews.new'
import { Route as InterviewsIdRoute } from '../_authenticated.interviews.$id'
import { Route as InterviewsFeedbackIdRoute } from '../_authenticated.interviews.$id.feedback'
import { Route as InterviewsSessionIdRoute } from '../_authenticated.interviews.$id.session'

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

  it('keeps interviews/$id/session under the authenticated route guard chain', function () {
    const router = getRouter()
    const interviewsSessionRoute =
      router.routesById['/_authenticated/interviews/$id/session']

    expect(interviewsSessionRoute.id).toBe('/_authenticated/interviews/$id/session')
    expect(interviewsSessionRoute.parentRoute.id).toBe('/_authenticated/interviews')
    expect(interviewsSessionRoute.parentRoute.parentRoute.id).toBe('/_authenticated')
    expect(typeof interviewsSessionRoute.parentRoute.parentRoute.options.beforeLoad).toBe(
      'function',
    )
  })

  it('keeps interviews/$id under the authenticated route guard chain', function () {
    const router = getRouter()
    const interviewsIdRoute = router.routesById['/_authenticated/interviews/$id']

    expect(interviewsIdRoute.id).toBe('/_authenticated/interviews/$id')
    expect(interviewsIdRoute.parentRoute.id).toBe('/_authenticated/interviews')
    expect(interviewsIdRoute.parentRoute.parentRoute.id).toBe('/_authenticated')
    expect(typeof interviewsIdRoute.parentRoute.parentRoute.options.beforeLoad).toBe(
      'function',
    )
  })

  it('keeps interviews/$id/feedback under the authenticated route guard chain', function () {
    const router = getRouter()
    const interviewsFeedbackRoute =
      router.routesById['/_authenticated/interviews/$id/feedback']

    expect(interviewsFeedbackRoute.id).toBe('/_authenticated/interviews/$id/feedback')
    expect(interviewsFeedbackRoute.parentRoute.id).toBe('/_authenticated/interviews')
    expect(interviewsFeedbackRoute.parentRoute.parentRoute.id).toBe('/_authenticated')
    expect(typeof interviewsFeedbackRoute.parentRoute.parentRoute.options.beforeLoad).toBe(
      'function',
    )
  })

  it('does not define interviews-specific auth guards', function () {
    const router = getRouter()
    const interviewsRoute = router.routesById['/_authenticated/interviews']
    const interviewsNewRoute =
      router.routesById['/_authenticated/interviews/new']
    const interviewsIdRoute = router.routesById['/_authenticated/interviews/$id']
    const interviewsFeedbackRoute =
      router.routesById['/_authenticated/interviews/$id/feedback']
    const interviewsSessionRoute =
      router.routesById['/_authenticated/interviews/$id/session']
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

    expect(InterviewsIdRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsIdRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsIdRoute.parentRoute.id).toBe(interviewsRoute.id)
    expect(interviewsIdRoute.parentRoute.parentRoute.id).toBe(authenticatedRoute.id)
    expect(interviewsIdRoute.parentRoute.parentRoute.options.beforeLoad).toBe(
      authenticatedRoute.options.beforeLoad,
    )

    expect(InterviewsFeedbackIdRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsFeedbackRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsFeedbackRoute.parentRoute.id).toBe(interviewsRoute.id)
    expect(interviewsFeedbackRoute.parentRoute.parentRoute.id).toBe(authenticatedRoute.id)
    expect(interviewsFeedbackRoute.parentRoute.parentRoute.options.beforeLoad).toBe(
      authenticatedRoute.options.beforeLoad,
    )

    expect(InterviewsSessionIdRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsSessionRoute.options.beforeLoad).toBeUndefined()
    expect(interviewsSessionRoute.parentRoute.id).toBe(interviewsRoute.id)
    expect(interviewsSessionRoute.parentRoute.parentRoute.id).toBe(authenticatedRoute.id)
    expect(interviewsSessionRoute.parentRoute.parentRoute.options.beforeLoad).toBe(
      authenticatedRoute.options.beforeLoad,
    )

    const authenticatedBeforeLoad = AuthenticatedRoute.options.beforeLoad
    expect(typeof authenticatedBeforeLoad).toBe('function')
  })
})

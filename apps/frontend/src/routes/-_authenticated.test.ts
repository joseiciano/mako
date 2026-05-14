import { describe, expect, it, vi } from 'vitest'
import { Route } from './_authenticated'

describe('authenticated route guard', function () {
  it('loads auth state through the router query client', async function () {
    const fetchQuery = vi.fn().mockResolvedValue({
      session: { id: 'session-1' },
      user: { id: 'user-1' },
    })

    const beforeLoad = Route.options.beforeLoad

    await expect(
      beforeLoad?.({ context: { queryClient: { fetchQuery } } } as never),
    ).resolves.toBeUndefined()

    expect(fetchQuery).toHaveBeenCalledTimes(1)
    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['auth', 'session'],
      }),
    )
  })

  it('redirects to login when the auth session query resolves unauthenticated', async function () {
    const fetchQuery = vi.fn().mockResolvedValue({
      session: null,
      user: null,
    })

    const beforeLoad = Route.options.beforeLoad

    await expect(
      beforeLoad?.({ context: { queryClient: { fetchQuery } } } as never),
    ).rejects.toBeDefined()
  })
})

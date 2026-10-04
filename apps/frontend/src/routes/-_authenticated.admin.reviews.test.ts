import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Route } from './_authenticated.admin.reviews'

async function runGuard(session: unknown) {
  const fetchQuery = vi.fn().mockResolvedValue(session)
  const beforeLoad = Route.options.beforeLoad

  return beforeLoad?.({ context: { queryClient: { fetchQuery } } } as never)
}

describe('admin reviews route', function suite() {
  it('allows admins', async function run() {
    await expect(
      runGuard({ session: { id: 's' }, user: { id: 'u', isAdmin: true } }),
    ).resolves.toBeUndefined()
  })

  it('redirects non-admins to the dashboard', async function run() {
    await expect(
      runGuard({ session: { id: 's' }, user: { id: 'u', isAdmin: false } }),
    ).rejects.toMatchObject({ options: { to: '/dashboard' } })
  })

  it('redirects a missing session to the dashboard guard (login handled by the parent)', async function run() {
    await expect(runGuard(null)).rejects.toMatchObject({ options: { to: '/dashboard' } })
  })

  it('is registered beneath the authenticated tree, which redirects to login', function run() {
    const routeTree = readFileSync(resolve(__dirname, '../routeTree.gen.ts'), 'utf8')
    expect(routeTree).toContain("'/_authenticated/admin/reviews'")
    expect(routeTree).toContain("fullPath: '/admin/reviews'")

    const layoutSource = readFileSync(resolve(__dirname, '_authenticated.tsx'), 'utf8')
    expect(layoutSource).toMatch(/redirect\(\{\s*to:\s*'\/login'/)
  })
})

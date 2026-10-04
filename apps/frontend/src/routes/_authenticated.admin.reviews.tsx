import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminReview } from '../components/admin/admin-review'
import { authSessionQueryOptions } from '../hooks/use-auth'

// UX-only guard: the API's requireAdmin remains the authority.
export const Route = createFileRoute('/_authenticated/admin/reviews')({
  beforeLoad: async function guardAdminRoute({ context }) {
    if (typeof window === 'undefined') {
      return
    }

    const session = await context.queryClient.fetchQuery(authSessionQueryOptions())

    if (session?.user?.isAdmin !== true) {
      throw redirect({
        to: '/dashboard',
      })
    }
  },
  component: AdminReview,
})

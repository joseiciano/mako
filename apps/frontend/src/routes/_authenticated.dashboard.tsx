import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from './dashboard/dashboard-smart'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: Dashboard,
})

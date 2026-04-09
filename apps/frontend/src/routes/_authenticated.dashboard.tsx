import { createFileRoute } from '@tanstack/react-router'
import { DashboardSmart } from './dashboard/dashboard-smart'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardSmart,
})

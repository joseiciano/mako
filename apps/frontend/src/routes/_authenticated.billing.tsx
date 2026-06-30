import { createFileRoute } from '@tanstack/react-router'
import { BillingSmart } from './billing/billing-smart'

export const Route = createFileRoute('/_authenticated/billing')({
  component: BillingSmart,
})

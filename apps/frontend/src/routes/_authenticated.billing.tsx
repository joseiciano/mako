import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/billing')({
  component: BillingPage,
})

function BillingPage() {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-2xl font-semibold text-white">Billing</h2>
      <p className="mt-3 text-slate-300">Manage subscription plans and purchase interview credits.</p>
    </section>
  )
}

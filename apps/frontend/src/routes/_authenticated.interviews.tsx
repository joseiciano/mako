import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/interviews')({
  component: InterviewsPage,
})

function InterviewsPage() {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-2xl font-semibold text-white">Interviews</h2>
      <p className="mt-3 text-slate-300">Your upcoming and historical interview sessions will appear here.</p>
    </section>
  )
}

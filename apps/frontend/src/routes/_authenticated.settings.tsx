import { createFileRoute, Link } from '@tanstack/react-router'
import { useAccount } from '../hooks/use-account'

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
})

export default function SettingsPage() {
  const accountQuery = useAccount()
  const isVerifiedInterviewer = accountQuery.data?.isVerifiedInterviewer ?? false

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-2xl font-semibold text-white">Settings</h2>
      <p className="mt-3 text-slate-300">Update your profile and account preferences.</p>

      <nav className="mt-6 flex flex-col gap-2" aria-label="Settings navigation">
        <Link
          to="/settings/profile"
          className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
        >
          Profile
        </Link>

        {isVerifiedInterviewer && (
          <Link
            to="/settings/interviewer-availability"
            className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
          >
            Interviewer Availability
          </Link>
        )}
      </nav>
    </section>
  )
}

import { CompanyList } from '#/components/profile/company-list'

export function ProfileDumb() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-emerald-300">Settings</p>
        <h1 className="text-3xl font-semibold text-white">Profile</h1>
        <p className="text-sm text-slate-300">
          Manage your employment history for verification and better matching.
        </p>
      </header>

      <CompanyList />
    </main>
  )
}

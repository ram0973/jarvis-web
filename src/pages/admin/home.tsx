import { adminLayout } from '@/pages/admin/layout'
import { adminStatsQuery } from '@/lib/admin/users'
import { adminOnlyPlugin } from '@/lib/auth/plugins'
import { Link } from '@/lib/navigation'

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-sm font-medium text-slate-500">{label}</p>
    <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
  </div>
)

export default adminLayout
  .lets('page', 'adminHome', '/')
  .head('Admin')
  .use(adminOnlyPlugin)
  .page(() => {
    const stats = adminStatsQuery.useQuery()

    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin</h1>
          <p className="text-sm text-slate-600">Everything that needs `role: admin` lives under this section.</p>
        </div>
        {stats.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : stats.error ? (
          <p className="text-sm text-red-600">{stats.error.message}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Users" value={stats.data?.users ?? 0} />
            <Stat label="Admins" value={stats.data?.admins ?? 0} />
            <Stat label="Banned" value={stats.data?.banned ?? 0} />
          </div>
        )}
        <p className="text-sm text-slate-600">
          Manage accounts on the{' '}
          <Link className="font-medium text-blue-700 hover:text-blue-600" route="adminUsers">
            users page
          </Link>
          .
        </p>
      </div>
    )
  })

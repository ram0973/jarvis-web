import { generalLayout } from '@/layouts/general'
import { redirectUnauthorizedPlugin } from '@/lib/auth/plugins'

export default generalLayout
  .lets('page', 'profile', '/profile')
  .head('Profile')
  // Anonymous visitors never see this page: the gate redirects them to `signIn`, on SSR and on client navigation.
  .use(redirectUnauthorizedPlugin)
  .page(({ props: { me } }) => (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="text-sm text-slate-600">What the server knows about the current session.</p>
      </div>
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-sm font-medium text-slate-500">Member</dt>
          <dd className="text-sm font-medium text-slate-900">#{me.user.sn}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-sm font-medium text-slate-500">Name</dt>
          <dd className="text-sm font-medium text-slate-900">{me.user.name}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-sm font-medium text-slate-500">Email</dt>
          <dd className="text-sm font-medium text-slate-900">{me.user.email}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-sm font-medium text-slate-500">Role</dt>
          <dd className="text-sm font-medium text-slate-900">{me.user.role ?? 'user'}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-sm font-medium text-slate-500">Session expires</dt>
          <dd className="text-sm font-medium text-slate-900">
            {new Date(me.session.expiresAt).toLocaleString('en-GB')}
          </dd>
        </div>
      </dl>
    </div>
  ))

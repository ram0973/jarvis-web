import { adminLayout } from '@/pages/admin/layout'
import {
  adminUserListQuery,
  adminUserSetBannedMutation,
  adminUserSetRoleMutation,
  adminUserUpdateMutation,
} from '@/lib/admin/users'
import { getMeQuery } from '@/lib/auth/api'
import { adminOnlyPlugin } from '@/lib/auth/plugins'
import { FormError } from '@/ui/form'
import { useState, type FormEvent } from 'react'

type EditingUser = { id: string; name: string; email: string }

export default adminLayout
  .lets('page', 'adminUsers', '/users')
  .head('Users')
  .use(adminOnlyPlugin)
  .page(() => {
    // Needed to grey out actions on our own row; the page itself is already gated.
    const me = getMeQuery.useQuery().data?.me
    // `search` is what the query runs with; `draft` is what the input holds until the form is submitted.
    const [draft, setDraft] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [error, setError] = useState<string | null>(null)
    const [editing, setEditing] = useState<EditingUser | null>(null)

    const list = adminUserListQuery.useQuery({ search, page })
    const setRole = adminUserSetRoleMutation.useMutation()
    const setBanned = adminUserSetBannedMutation.useMutation()
    const update = adminUserUpdateMutation.useMutation()

    const onSearch = (event: FormEvent) => {
      event.preventDefault()
      setPage(1)
      setSearch(draft.trim())
    }

    const run = async (action: () => Promise<unknown>, fallback: string) => {
      setError(null)
      try {
        await action()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : fallback)
      }
    }

    const saveProfile = async () => {
      if (!editing) {
        return
      }
      await run(
        () =>
          update.mutateAsync({
            userId: editing.id,
            name: editing.name,
            email: editing.email,
          }),
        'Could not save the profile',
      )
      setEditing(null)
    }

    const busy = setRole.isPending || setBanned.isPending || update.isPending

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Users</h1>
            <p className="text-sm text-slate-600">
              {list.data ? `${list.data.total} in total` : 'Loading…'}
              {search ? `, filtered by “${search}”` : ''}
            </p>
          </div>
          <form className="flex gap-2" onSubmit={onSearch}>
            <input
              className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
              placeholder="Name or email"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
              }}
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Search
            </button>
          </form>
        </div>

        <FormError message={error} />

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : list.error ? (
                <tr>
                  <td className="px-4 py-6 text-red-600" colSpan={6}>
                    {list.error.message}
                  </td>
                </tr>
              ) : list.data?.users.length ? (
                list.data.users.map((user) => {
                  const isSelf = me ? user.id === me.user.id : false
                  const isEditing = editing?.id === user.id
                  return (
                    <tr key={user.id} className={user.banned ? 'bg-red-50/40' : undefined}>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            value={editing.name}
                            onChange={(event) => {
                              setEditing({ ...editing, name: event.target.value })
                            }}
                          />
                        ) : (
                          <>
                            <p className="text-xs text-slate-400">#{user.sn}</p>
                            <p className="font-medium text-slate-900">{user.name}</p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            className="w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            type="email"
                            value={editing.email}
                            onChange={(event) => {
                              setEditing({ ...editing, email: event.target.value })
                            }}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-700">{user.email}</span>
                            {user.emailVerified ? (
                              <span
                                title="Email verified"
                                className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                              >
                                verified
                              </span>
                            ) : (
                              <span
                                title="Email not verified"
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"
                              >
                                unverified
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                          value={user.role ?? 'user'}
                          disabled={isSelf || busy}
                          onChange={(event) => {
                            void run(
                              () =>
                                setRole.mutateAsync({
                                  userId: user.id,
                                  role: event.target.value === 'admin' ? 'admin' : 'user',
                                }),
                              'Could not change the role',
                            )
                          }}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {user.banned ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            banned{user.banReason ? `: ${user.banReason}` : ''}
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  void saveProfile()
                                }}
                                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:bg-slate-300"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditing(null)
                                }}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setError(null)
                                  setEditing({ id: user.id, name: user.name, email: user.email })
                                }}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-300"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={isSelf || busy}
                                onClick={() => {
                                  void run(
                                    () => setBanned.mutateAsync({ userId: user.id, banned: !user.banned }),
                                    'Could not update the ban',
                                  )
                                }}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                              >
                                {user.banned ? 'Unban' : 'Ban'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    Nothing found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-600">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => {
              setPage(page - 1)
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Previous
          </button>
          <span>
            Page {list.data?.page ?? page} of {list.data?.pageCount ?? 1}
          </span>
          <button
            type="button"
            disabled={page >= (list.data?.pageCount ?? 1)}
            onClick={() => {
              setPage(page + 1)
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Next
          </button>
        </div>
      </div>
    )
  })

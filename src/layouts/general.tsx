import { getMeQuery } from '@/lib/auth/api'
import { signOut } from '@/lib/auth/client'
import { NavLink, navigate } from '@/lib/navigation'
import { root } from '@/lib/root'
import { useIsNavigating } from '@point0/core/navigation'
import { useState } from 'react'

const navLinkClassName = 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100'
const navLinkActiveClassName = 'pointer-events-none text-slate-300!'

export const generalLayout = root.lets('layout', 'generalLayout').layout(({ children }) => {
  const isNavigating = useIsNavigating()
  // The same never-stale query the gates use, so the header flips the moment `getMeQuery` is refetched.
  const me = getMeQuery.useQuery().data?.me
  const [signingOut, setSigningOut] = useState(false)

  const onSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      await getMeQuery.refetchQuery()
      await navigate('home')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-linear-to-b from-slate-100 via-slate-50 to-blue-50 text-slate-800 transition-opacity duration-300 ease-in-out"
      style={{ opacity: isNavigating ? 0.6 : 1 }}
    >
      <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl border border-white/70 bg-white/80 px-6 py-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              <NavLink className="hover:text-blue-700" exactClassName="pointer-events-none" route="home">
                My App
              </NavLink>
            </h1>
            <nav>
              <ul className="flex flex-wrap items-center gap-2">
                <li>
                  <NavLink exactClassName={navLinkActiveClassName} className={navLinkClassName} route="home">
                    Home
                  </NavLink>
                </li>
                <li>
                  <NavLink exactClassName={navLinkActiveClassName} className={navLinkClassName} route="about">
                    About
                  </NavLink>
                </li>
                {me ? (
                  <>
                    {me.admin ? (
                      <li>
                        <NavLink exactClassName={navLinkActiveClassName} className={navLinkClassName} route="adminHome">
                          Admin
                        </NavLink>
                      </li>
                    ) : null}
                    <li>
                      <NavLink exactClassName={navLinkActiveClassName} className={navLinkClassName} route="profile">
                        Profile
                      </NavLink>
                    </li>
                    <li className="ml-1 hidden text-xs text-slate-400 sm:block">{me.user.email}</li>
                    <li>
                      <button
                        type="button"
                        onClick={onSignOut}
                        disabled={signingOut}
                        className={navLinkClassName + ' disabled:cursor-not-allowed disabled:text-slate-300'}
                      >
                        {signingOut ? 'Signing out…' : 'Sign out'}
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <NavLink exactClassName={navLinkActiveClassName} className={navLinkClassName} route="signIn">
                        Sign in
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        exactClassName={navLinkActiveClassName + ' bg-blue-600! text-white!'}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
                        route="signUp"
                      >
                        Sign up
                      </NavLink>
                    </li>
                  </>
                )}
              </ul>
            </nav>
          </div>
        </header>
        <main className="rounded-2xl border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur">{children}</main>
      </div>
    </div>
  )
})

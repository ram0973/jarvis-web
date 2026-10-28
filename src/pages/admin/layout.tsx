import { generalLayout } from '@/layouts/general'
import { adminOnlyPlugin } from '@/lib/auth/plugins'
import { NavLink } from '@/lib/navigation'

/**
 * The admin shell. It grows from `generalLayout` (not from `root`) so the site header — brand, Profile, Sign out —
 * stays on every admin page. `/admin` is the route prefix every child inherits; the gate is applied here and again on
 * each page, so a new admin page cannot be left open by forgetting `.use`.
 *
 * @tags admin, layout
 */
export const adminLayout = generalLayout.lets
  .layout('/admin')
  .use(adminOnlyPlugin)
  .layout(({ children }) => (
    <div className="space-y-6">
      <nav>
        <ul className="flex flex-wrap items-center gap-1">
          <li>
            <NavLink
              exactClassName="bg-slate-900! text-white!"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              route="adminHome"
            >
              Overview
            </NavLink>
          </li>
          <li>
            <NavLink
              exactClassName="bg-slate-900! text-white!"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              route="adminUsers"
            >
              Users
            </NavLink>
          </li>
          <li>
            <NavLink
              exactClassName="bg-slate-900! text-white!"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              route="adminWiki"
            >
              Wiki
            </NavLink>
          </li>
        </ul>
      </nav>
      {children}
    </div>
  ))

import type { InputHTMLAttributes, ReactNode } from 'react'

// Small form primitives shared by the auth pages (and, later, the admin forms). Plain Tailwind, no form library —
// the app has none, and a controlled input is all these forms need.

export const TextField = ({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block space-y-1.5">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    <input
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
      {...props}
    />
  </label>
)

export const FormError = ({ message }: { message: string | null }) =>
  message ? (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  ) : null

export const SubmitButton = ({ pending, children }: { pending: boolean; children: ReactNode }) => (
  <button
    type="submit"
    disabled={pending}
    className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
  >
    {children}
  </button>
)

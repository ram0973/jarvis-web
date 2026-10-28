import { generalLayout } from '@/layouts/general'
import { getMeQuery } from '@/lib/auth/api'
import { authClient } from '@/lib/auth/client'
import { redirectAuthorizedPlugin } from '@/lib/auth/plugins'
import { Link, navigate } from '@/lib/navigation'
import { FormError, SubmitButton, TextField } from '@/ui/form'
import { useState, type FormEvent } from 'react'

export default generalLayout
  .lets('page', 'signIn', '/sign-in')
  .head('Sign in')
  // Signed-in users have no business here — send them home instead of showing a second sign-in form.
  .use(redirectAuthorizedPlugin)
  .page(() => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)

    const submit = async (event: FormEvent) => {
      event.preventDefault()
      setPending(true)
      setError(null)
      try {
        const { error: signInError } = await authClient.signIn.email({ email, password })
        if (signInError) {
          setError(signInError.message ?? 'Could not sign in')
          return
        }
        // The session cookie is set; make the shared `me` query see it before we navigate.
        await getMeQuery.refetchQuery()
        await navigate('home')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not sign in')
      } finally {
        setPending(false)
      }
    }

    return (
      <div className="mx-auto max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-600">Use the credentials you registered with.</p>
        </div>
        <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submit}>
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="name@example.com"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
          />
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
            }}
          />
          <FormError message={error} />
          <SubmitButton pending={pending}>{pending ? 'Signing in…' : 'Sign in'}</SubmitButton>
        </form>
        <p className="text-sm text-slate-600">
          No account yet?{' '}
          <Link className="font-medium text-blue-700 hover:text-blue-600" route="signUp">
            Create one
          </Link>
        </p>
      </div>
    )
  })

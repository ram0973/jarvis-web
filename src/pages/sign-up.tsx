import { generalLayout } from '@/layouts/general'
import { getMeQuery } from '@/lib/auth/api'
import { authClient } from '@/lib/auth/client'
import { redirectAuthorizedPlugin } from '@/lib/auth/plugins'
import { Link, navigate } from '@/lib/navigation'
import { FormError, SubmitButton, TextField } from '@/ui/form'
import { useState, type FormEvent } from 'react'

export default generalLayout
  .lets('page', 'signUp', '/sign-up')
  .head('Sign up')
  .use(redirectAuthorizedPlugin)
  .page(() => {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)

    const submit = async (event: FormEvent) => {
      event.preventDefault()
      setPending(true)
      setError(null)
      try {
        // Email verification and OAuth are off, so this sets the session cookie right away — same path as sign-in.
        const { error: signUpError } = await authClient.signUp.email({ name, email, password })
        if (signUpError) {
          setError(signUpError.message ?? 'Could not create the account')
          return
        }
        await getMeQuery.refetchQuery()
        await navigate('home')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create the account')
      } finally {
        setPending(false)
      }
    }

    return (
      <div className="mx-auto max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Create an account</h1>
          <p className="text-sm text-slate-600">Name and email are all we need — no confirmation email yet.</p>
        </div>
        <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submit}>
          <TextField
            label="Name"
            name="name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
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
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
            }}
          />
          <FormError message={error} />
          <SubmitButton pending={pending}>{pending ? 'Creating…' : 'Create account'}</SubmitButton>
        </form>
        <p className="text-sm text-slate-600">
          Already registered?{' '}
          <Link className="font-medium text-blue-700 hover:text-blue-600" route="signIn">
            Sign in
          </Link>
        </p>
      </div>
    )
  })

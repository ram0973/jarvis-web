import { serverEnv } from '@/lib/env/server'
import { ensureInitialAdmin } from '@/lib/auth/init.js'
import { engine } from '@/engine.js'

// The env handle is lazy, so nothing is checked until it's read. Validate the whole server shape up front instead —
// a misconfigured server then fails at startup, not on the first request that happens to touch a missing variable.
serverEnv.validate()

// Before serving: there has to be an admin account to sign in with (see `lib/auth/init.ts`).
await ensureInitialAdmin()

await engine.serve()

// you can place any other server code here (workers, initializers, etc.), it is not only api entry point

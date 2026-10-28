import { Error0 } from '@1gr14/error0'
import { codeStatusPlugin } from '@1gr14/error0/plugins/code-status'
import { flatOriginalPlugin } from '@1gr14/error0/plugins/flat-original'
import { metaPlugin } from '@1gr14/error0/plugins/meta'
import { redirectPlugin } from '@1gr14/error0/plugins/point0-redirect'
import { responsePlugin } from '@1gr14/error0/plugins/response'
import { stackPlugin } from '@1gr14/error0/plugins/stack'

// Optional — there's a default ErrorPoint0, but you can replace it with your own error class:
// one built with Error0, or just a plain class extended from Error.
export const AppError = Error0.mark('AppError')
  // One plugin owns both fields: the code names the failure, the map turns it into the HTTP status, and `transport:
  // 'public'` keeps the code on the wire — a client has to be able to tell `UNAUTHORIZED` from a random 403.
  .use(
    codeStatusPlugin({
      codes: { UNAUTHORIZED: 401, FORBIDDEN: 403, CONFLICT: 409 },
      transport: 'public',
    }),
  )
  .use(metaPlugin())
  .use(responsePlugin())
  .use(redirectPlugin())
  .use(flatOriginalPlugin())
  .use(stackPlugin())

export type AppError = InstanceType<typeof AppError>

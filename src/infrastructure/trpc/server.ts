import 'server-only'
import { appRouter } from './routers'
import { createTRPCContext } from './trpc'

export async function createCaller() {
  const ctx = await createTRPCContext()
  return appRouter.createCaller(ctx)
}

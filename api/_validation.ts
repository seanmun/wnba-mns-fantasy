import { z } from 'zod'

export type ParseOk<T> = { success: true; data: T }
export type ParseErr = { success: false; error: string }
export type ParseResult<T> = ParseOk<T> | ParseErr

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body)
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    error: result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; '),
  }
}

// --- Common request schemas ---

export const userSyncSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  avatarUrl: z.string().nullable().optional(),
})

export const telegramAlertSchema = z.object({
  message: z.string().min(1),
  botType: z.enum(['alert', 'draft']),
  chatId: z.string().optional(),
})

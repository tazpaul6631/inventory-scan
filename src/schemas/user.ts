import { z } from 'zod'
import { i18n } from '@/i18n'

export type UserFormMode = 'create' | 'edit'

function requiredText(message: string) {
  return z.preprocess((value) => value ?? '', z.string().trim().min(1, message))
}

function requiredPassword(message: string) {
  return z.preprocess((value) => value ?? '', z.string().min(1, message))
}

export function createUserFormSchema(mode: UserFormMode) {
  const t = i18n.global.t
  const base = {
    code: requiredText(t('validation.codeRequired')),
    name: z.preprocess((value) => value ?? '', z.string().trim().min(2, t('validation.nameMin'))),
    allowWeb: z.boolean(),
    isActive: z.boolean(),
  }
  if (mode === 'create') {
    return z.object({
      ...base,
      password: requiredPassword(t('validation.passwordRequired')),
    })
  }
  return z.object({
    ...base,
    password: z.string().optional(),
  })
}

export function createChangePasswordSchema() {
  const t = i18n.global.t
  return z
    .object({
      oldPassword: requiredPassword(t('validation.passwordRequired')),
      newPassword: requiredPassword(t('validation.passwordRequired')),
      confirmPassword: requiredPassword(t('validation.passwordRequired')),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      message: t('validation.passwordMismatch'),
      path: ['confirmPassword'],
    })
}

export type UserFormValues = z.infer<ReturnType<typeof createUserFormSchema>>
export type ChangePasswordFormValues = z.infer<ReturnType<typeof createChangePasswordSchema>>

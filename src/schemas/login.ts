import { z } from 'zod'
import { i18n } from '@/i18n'

export type LoginMode = 'mobile' | 'web'

function staffIdField() {
  const t = i18n.global.t
  return z.preprocess((value) => value ?? '', z.string().trim().min(1, t('validation.staffIdRequired')))
}

export function createLoginSchema(mode: LoginMode) {
  const t = i18n.global.t
  if (mode === 'mobile') {
    return z.object({
      factory: z.preprocess((value) => value ?? '', z.string().trim().min(1, t('validation.factoryRequired'))),
      cycle: z.preprocess((value) => value ?? '', z.string().trim().min(1, t('validation.cycleRequired'))),
      staffId: staffIdField(),
      password: z.preprocess((value) => value ?? '', z.string().optional()),
    })
  }
  return z.object({
    factory: z.string().optional(),
    cycle: z.string().optional(),
    staffId: staffIdField(),
    password: z.preprocess((value) => value ?? '', z.string().min(1, t('validation.passwordRequired'))),
  })
}

export type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>

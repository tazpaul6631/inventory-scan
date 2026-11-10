import { z } from 'zod'
import { i18n } from '@/i18n'

export type CycleFormMode = 'create' | 'edit'

export function createCycleFormSchema() {
  const t = i18n.global.t
  return z.object({
    scanDate: z.preprocess(
      (value) => value ?? undefined,
      z.date({
        required_error: t('validation.cycleRequired'),
        invalid_type_error: t('validation.cycleRequired'),
      }),
    ),
    description: z.preprocess(
      (value) => String(value ?? '').trim(),
      z.string().min(1, t('validation.cycleDescriptionRequired')),
    ),
  })
}

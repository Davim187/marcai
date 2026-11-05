import {
  type QueryClient,
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError, errorMessage, FriendlyError } from './api'
import type { Category, FormFieldDTO, Professional, Service } from './types'

export const qk = {
  services: ['services'] as const,
  categories: ['categories'] as const,
  professionals: ['professionals'] as const,
  formFields: ['form-fields'] as const,
  schedule: (pid?: string) => ['schedule', pid ?? 'all'] as const,
  tenant: ['tenant'] as const,
  bookings: ['bookings'] as const,
  customers: ['customers'] as const,
  dashboard: ['dashboard'] as const,
  notifications: ['notifications'] as const,
  notificationSettings: ['notification-settings'] as const,
  templates: ['templates'] as const,
  calendar: ['calendar'] as const,
  booking: (id?: string | null) => ['booking', id] as const,
  customer: (id?: string) => (id ? (['customer', id] as const) : (['customer'] as const)),
  members: ['members'] as const,
  billing: ['billing'] as const,
  publicSlots: ['public-slots'] as const,
  publicDays: ['public-days'] as const,
}

/**
 * Tudo que mostra agendamentos precisa ser atualizado junto depois de criar, remarcar,
 * cancelar ou receber um aviso. Um único lugar para não esquecer nenhuma tela.
 */
export function invalidateBookingViews(qc: QueryClient) {
  for (const key of [
    qk.calendar,
    qk.bookings,
    ['booking'],
    qk.dashboard,
    qk.customers,
    ['customer'],
    ['schedule'],
  ]) {
    qc.invalidateQueries({ queryKey: key })
  }
}

export const useServices = () =>
  useQuery({ queryKey: qk.services, queryFn: () => api<Service[]>('/services') })
export const useCategories = () =>
  useQuery({ queryKey: qk.categories, queryFn: () => api<Category[]>('/services/categories') })
export const useProfessionals = () =>
  useQuery({
    queryKey: qk.professionals,
    queryFn: () =>
      api<Array<Professional & { member: { role: string; email: string } | null }>>(
        '/team/professionals',
      ),
  })
export const useFormFields = () =>
  useQuery({ queryKey: qk.formFields, queryFn: () => api<FormFieldDTO[]>('/forms/fields') })

/** Mutação com toast de sucesso/erro e invalidação de queries. */
export function useApiMutation<TVars = void, TRes = unknown>(
  fn: (vars: TVars) => Promise<TRes>,
  opts: {
    success?: string | ((r: TRes) => string)
    invalidate?: QueryKey[]
    onSuccess?: (r: TRes, v: TVars) => void
  } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (res, vars) => {
      if (opts.success)
        toast.success(typeof opts.success === 'function' ? opts.success(res) : opts.success)
      opts.invalidate?.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      opts.onSuccess?.(res, vars)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
}

export interface TimeOffInput {
  professionalId: string | null | undefined
  startsAt: string
  endsAt: string
  reason?: string | null
}

/** Cria um bloqueio de horário (folga, médico…). Único ponto usado pela agenda e por Horários. */
/**
 * Cria um bloqueio. Se houver agendamentos no período, pergunta antes (o bloqueio não
 * cancela quem já marcou).
 */
export async function createTimeOff(input: TimeOffInput) {
  const body = {
    ...input,
    professionalId: input.professionalId ?? null,
    reason: input.reason || null,
  }
  try {
    return await api('/schedule/time-off', { body })
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'AGENDAMENTOS_NO_PERIODO') throw err
    if (!window.confirm(`${err.message}\n\nBloquear mesmo assim?`))
      throw new FriendlyError('Bloqueio não criado.')
    return api('/schedule/time-off', { body: { ...body, confirmConflicts: true } })
  }
}

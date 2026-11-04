import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, errorMessage } from './api'
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

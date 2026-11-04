import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { registerSchema, type RegisterInput } from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { api, ApiError, errorMessage } from '@/lib/api'
import { useRefreshSession, useSession } from '@/lib/session'
import { AuthLayout, Divider, GoogleButton } from './auth-layout'

export default function RegisterPage() {
  const navigate = useNavigate()
  const refresh = useRefreshSession()
  const { data: session } = useSession()
  const { register, handleSubmit, formState, control, setError } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api('/auth/register', { body: values })
      await refresh()
      navigate('/onboarding', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_EM_USO')
        setError('email', { message: err.message })
      else toast.error(errorMessage(err))
    }
  })

  return (
    <AuthLayout
      title="Crie sua agenda online"
      subtitle="30 dias grátis, sem cartão. Leva menos de 3 minutos."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className="text-primary font-semibold hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      {session?.googleEnabled && (
        <>
          <GoogleButton />
          <Divider />
        </>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Seu nome" htmlFor="name" error={formState.errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={!!formState.errors.name}
            {...register('name')}
          />
        </Field>
        <Field label="E-mail" htmlFor="email" error={formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!formState.errors.email}
            {...register('email')}
          />
        </Field>
        <Field
          label="Senha"
          htmlFor="password"
          error={formState.errors.password?.message}
          hint="Mínimo de 8 caracteres."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!formState.errors.password}
            {...register('password')}
          />
        </Field>
        <div className="space-y-1">
          <div className="flex items-start gap-2.5">
            <Controller
              control={control}
              name="acceptTerms"
              render={({ field }) => (
                <Checkbox
                  id="terms"
                  checked={field.value === true}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                />
              )}
            />
            <label htmlFor="terms" className="text-muted-foreground text-sm">
              Li e aceito os{' '}
              <Link
                to="/termos"
                target="_blank"
                className="text-primary font-medium hover:underline"
              >
                termos de uso
              </Link>{' '}
              e a{' '}
              <Link
                to="/privacidade"
                target="_blank"
                className="text-primary font-medium hover:underline"
              >
                política de privacidade
              </Link>
              .
            </label>
          </div>
          {formState.errors.acceptTerms && (
            <p className="text-destructive text-xs font-medium">
              {formState.errors.acceptTerms.message}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Criar minha conta grátis
        </Button>
      </form>
    </AuthLayout>
  )
}

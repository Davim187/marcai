import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { loginSchema, type LoginInput } from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { useRefreshSession, useSession } from '@/lib/session'
import { AuthLayout, Divider, GoogleButton } from './auth-layout'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const refresh = useRefreshSession()
  const { data: session } = useSession()
  const { register, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })
  const googleError = params.get('erro')

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api('/auth/login', { body: values })
      await refresh()
      navigate(params.get('voltar') ?? '/painel', { replace: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  return (
    <AuthLayout
      title="Que bom te ver de novo 💖"
      subtitle="Entre para ver sua agenda."
      footer={
        session?.appMode !== 'single_tenant' && (
          <>
            Ainda não tem conta?{' '}
            <Link to="/cadastro" className="text-primary font-semibold hover:underline">
              Comece grátis por 30 dias
            </Link>
          </>
        )
      }
    >
      {googleError && (
        <p className="bg-destructive/10 text-destructive mb-4 rounded-lg p-3 text-sm" role="alert">
          {googleError === 'sem-conta'
            ? 'Não encontramos uma conta com esse e-mail.'
            : 'Não foi possível entrar com o Google. Tente de novo.'}
        </p>
      )}
      {session?.googleEnabled && (
        <>
          <GoogleButton />
          <Divider />
        </>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="E-mail" htmlFor="email" error={formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!formState.errors.email}
            {...register('email')}
          />
        </Field>
        <Field label="Senha" htmlFor="password" error={formState.errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!formState.errors.password}
            {...register('password')}
          />
        </Field>
        <div className="text-right">
          <Link to="/recuperar-senha" className="text-primary text-sm font-medium hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Entrar
        </Button>
      </form>
    </AuthLayout>
  )
}

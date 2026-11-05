import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { toast } from 'sonner'
import type { z } from 'zod'
import { forgotPasswordSchema } from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { AuthLayout } from './auth-layout'

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState } = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
  })
  const onSubmit = handleSubmit(async (values) => {
    try {
      await api('/auth/forgot-password', { body: values })
      setSent(true)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })
  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Enviamos um link para você criar uma senha nova."
      footer={
        <Link to="/entrar" className="text-primary font-semibold hover:underline">
          Voltar para o login
        </Link>
      }
    >
      {sent ? (
        <div className="bg-success/10 text-success rounded-xl p-4 text-sm" role="status">
          Pronto. Se o e-mail estiver cadastrado, o link chega em instantes. Confira também a caixa
          de spam.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="E-mail" htmlFor="email" error={formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

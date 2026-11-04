import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { AuthLayout } from './auth-layout'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const token = params.get('token') ?? ''
  const tooShort = password.length > 0 && password.length < 8

  return (
    <AuthLayout
      title="Criar nova senha"
      footer={
        <Link to="/entrar" className="text-primary font-semibold hover:underline">
          Voltar para o login
        </Link>
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (password.length < 8) return
          setLoading(true)
          try {
            await api('/auth/reset-password', { body: { token, password } })
            toast.success('Senha alterada! Entre com a nova senha.')
            navigate('/entrar')
          } catch (err) {
            toast.error(errorMessage(err))
          } finally {
            setLoading(false)
          }
        }}
      >
        <Field
          label="Nova senha"
          htmlFor="password"
          error={tooShort ? 'A senha precisa ter pelo menos 8 caracteres' : undefined}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!token}>
          Salvar nova senha
        </Button>
      </form>
    </AuthLayout>
  )
}

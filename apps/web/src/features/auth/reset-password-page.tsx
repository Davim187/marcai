import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { api, ApiError, errorMessage } from '@/lib/api'
import { AuthLayout } from './auth-layout'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [expired, setExpired] = useState(false)
  const token = params.get('token') ?? ''
  const tooShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && confirm !== password

  const footer = (
    <Link to="/entrar" className="text-primary font-semibold hover:underline">
      Voltar para o login
    </Link>
  )

  // Link sem token ou já usado/expirado: oferece pedir outro
  if (!token || expired) {
    return (
      <AuthLayout title="Link inválido ou expirado" footer={footer}>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Este link já foi usado ou passou do prazo. Peça um novo para criar sua senha.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link to="/recuperar-senha">Pedir novo link</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Criar nova senha" footer={footer}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (password.length < 8 || password !== confirm) return
          setLoading(true)
          try {
            await api('/auth/reset-password', { body: { token, password } })
            toast.success('Senha alterada. Entre com a nova senha.')
            navigate('/entrar')
          } catch (err) {
            if (err instanceof ApiError && err.code === 'TOKEN_INVALIDO') setExpired(true)
            else toast.error(errorMessage(err))
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
        <Field
          label="Confirmar nova senha"
          htmlFor="confirm"
          error={mismatch ? 'As senhas não conferem' : undefined}
        >
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={loading}
          disabled={password.length < 8 || password !== confirm}
        >
          Salvar nova senha
        </Button>
      </form>
    </AuthLayout>
  )
}

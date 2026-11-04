import { env } from '../../config/env'
import { badRequest } from '../../lib/errors'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export const googleEnabled = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
const redirectUri = () => `${env.API_URL}/api/auth/google/callback`

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })
  return `${AUTH_URL}?${params}`
}

export interface GoogleProfile {
  sub: string
  email: string
  email_verified: boolean
  name: string
  picture?: string
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) throw badRequest('Não foi possível entrar com o Google')
  const { access_token } = (await tokenRes.json()) as { access_token: string }
  const infoRes = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${access_token}` },
  })
  if (!infoRes.ok) throw badRequest('Não foi possível ler seu perfil do Google')
  const profile = (await infoRes.json()) as GoogleProfile
  if (!profile.email_verified) throw badRequest('Seu e-mail do Google ainda não foi verificado')
  return profile
}

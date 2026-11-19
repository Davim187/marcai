/** Cliente HTTP da API: cookies de sessão + header CSRF + erros em português. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public fields?: Record<string, string>,
    public details?: unknown,
  ) {
    super(message)
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

let csrfToken: string | undefined
export function setCsrfToken(token: string | undefined) {
  csrfToken = token
}

type ApiOpts = { method?: string; body?: unknown; signal?: AbortSignal; raw?: boolean }

/** Rotas em que um 401 é a resposta final (não adianta renovar a sessão e tentar de novo). */
const NO_REFRESH = /^\/auth\/(login|register|refresh|logout|reset-password|forgot-password)/

let refreshing: Promise<boolean> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Troca o refresh token (cookie httpOnly) por um par novo. Uma renovação por vez nesta aba;
 * entre abas, o Web Locks evita duas renovações simultâneas com o mesmo cookie.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const run = async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!res.ok) return false
        handleSessionPayload(await res.json().catch(() => null))
        return true
      } catch {
        return false
      }
    }
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    return locks ? locks.request('marcai-refresh', run) : run()
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** Agenda a renovação 1 min antes do access token vencer (cookies de imagem/SSE seguem válidos). */
export function scheduleRefresh(accessExpiresAt: string | undefined) {
  clearTimeout(refreshTimer)
  if (!accessExpiresAt) return
  const wait = new Date(accessExpiresAt).getTime() - Date.now() - 60_000
  refreshTimer = setTimeout(() => void refreshSession(), Math.max(wait, 5_000))
}

export function stopRefresh() {
  clearTimeout(refreshTimer)
}

function handleSessionPayload(data: unknown) {
  if (!data || typeof data !== 'object') return
  const d = data as { csrfToken?: unknown; accessExpiresAt?: unknown }
  // Login/cadastro/refresh devolvem o token de CSRF no corpo (o cookie é httpOnly)
  if (typeof d.csrfToken === 'string') csrfToken = d.csrfToken
  if (typeof d.accessExpiresAt === 'string') scheduleRefresh(d.accessExpiresAt)
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  if (path.startsWith('/auth/logout')) stopRefresh()
  try {
    return await request<T>(path, opts)
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || NO_REFRESH.test(path)) throw err
    if (!(await refreshSession())) throw err
    return request<T>(path, opts)
  }
}

async function request<T>(path: string, opts: ApiOpts): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')
  const headers: Record<string, string> = {}
  const isForm = opts.body instanceof FormData
  if (opts.body !== undefined && !isForm) headers['content-type'] = 'application/json'
  if (method !== 'GET') {
    const token = csrfToken
    if (token) headers['x-csrf-token'] = token
  }
  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      credentials: 'include',
      body:
        opts.body === undefined
          ? undefined
          : isForm
            ? (opts.body as FormData)
            : JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch {
    throw new ApiError(0, 'Sem conexão. Confira sua internet e tente de novo.', 'SEM_CONEXAO')
  }
  if (opts.raw && res.ok) return (await res.text()) as T
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const d = (data ?? {}) as {
      message?: string
      error?: string
      fields?: Record<string, string>
      details?: unknown
    }
    throw new ApiError(
      res.status,
      d.message ?? 'Algo deu errado. Tente de novo.',
      d.error ?? 'ERRO',
      d.fields,
      d.details,
    )
  }
  handleSessionPayload(data)
  return data as T
}

function safeJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const apiUrl = (path: string) => `${BASE}/api${path}`
/** Endereço de uma imagem salva: arquivos privados passam pela API (com a sessão). */
export const imageSrc = (url: string) => (url.startsWith('/api/') ? apiUrl(url.slice(4)) : url)

/** Mensagem amigável em português. Nunca repassa erro técnico cru (ex.: "Invalid time value"). */
/** Erro de validação feito no próprio front: a mensagem é mostrada como está. */
export class FriendlyError extends Error {}

export function errorMessage(err: unknown) {
  if (err instanceof FriendlyError) return err.message
  if (err instanceof ApiError) {
    const first = err.fields && Object.values(err.fields)[0]
    return err.code === 'VALIDACAO' && first ? `Confira os campos: ${first}` : err.message
  }
  return 'Algo deu errado. Tente de novo.'
}

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

function readCookie(name: string) {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1]
}

let csrfToken: string | undefined
export function setCsrfToken(token: string | undefined) {
  csrfToken = token
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal; raw?: boolean } = {},
): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')
  const headers: Record<string, string> = {}
  const isForm = opts.body instanceof FormData
  if (opts.body !== undefined && !isForm) headers['content-type'] = 'application/json'
  if (method !== 'GET') {
    const token = readCookie('marcai_csrf') ?? csrfToken
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
    const d = (data ?? {}) as { message?: string; error?: string; fields?: Record<string, string> }
    throw new ApiError(
      res.status,
      d.message ?? 'Algo deu errado. Tente de novo.',
      d.error ?? 'ERRO',
      d.fields,
    )
  }
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

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Algo deu errado. Tente de novo.'
}

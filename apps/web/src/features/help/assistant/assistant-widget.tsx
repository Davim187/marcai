import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowUp,
  BookOpen,
  LifeBuoy,
  MessageCircleQuestion,
  Play,
  RotateCcw,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/lib/session'
import { cn } from '@/lib/utils'
import { ARTICLES, canSee, TUTORIALS } from '../content'
import { useHelpUi } from '../help-ui'
import { useTour } from '../tour/tour-context'
import { type AssistantAction, type AssistantReply, getAssistantProvider } from './providers'

type Message =
  { id: number; from: 'user'; text: string } | { id: number; from: 'bot'; reply: AssistantReply }

const STORAGE_KEY = 'marcai-assistente'
const MAX_KEPT = 30

function loadHistory(): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Message[]) : []
  } catch {
    return []
  }
}

/** Sugestões: o que se faz na página atual primeiro, depois as dúvidas mais comuns. */
function suggestionsFor(pathname: string, role: string) {
  const page = TUTORIALS.filter((t) => t.route === pathname && canSee(t.audience, role)).map(
    (t) => t.title,
  )
  const common = [
    'Como divulgar meu link?',
    'Nenhum horário aparece na minha página',
    'Como bloquear uma folga?',
    'Como cobrar sinal pelo PIX?',
    'Como ligar o lembrete no WhatsApp?',
    ...ARTICLES.filter((a) => a.kind === 'faq' && canSee(a.audience, role)).map((a) => a.title),
  ]
  return [...new Set([...page, ...common])].slice(0, 5)
}

/** Botão flutuante + janela de conversa da ajuda. */
export function AssistantWidget() {
  const {
    assistantOpen,
    openAssistant,
    closeAssistant,
    pendingQuestion,
    consumeQuestion,
    openDemo,
  } = useHelpUi()
  const { tenant } = useTenant()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { start, active: tourActive } = useTour()
  const reduce = useReducedMotion()
  const [messages, setMessages] = useState<Message[]>(loadHistory)
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const provider = getAssistantProvider()

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_KEPT)))
    } catch {
      /* sem armazenamento: a conversa só não sobrevive ao recarregar */
    }
  }, [messages])

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [messages, thinking, reduce])

  useEffect(() => {
    if (assistantOpen) window.setTimeout(() => inputRef.current?.focus(), 50)
  }, [assistantOpen])

  async function ask(text: string) {
    const q = text.trim()
    if (!q || thinking) return
    setInput('')
    setMessages((m) => [...m, { id: Date.now(), from: 'user', text: q }])
    setThinking(true)
    try {
      const reply = await provider.answer(q, { role: tenant.role, pathname })
      setMessages((m) => [...m, { id: Date.now() + 1, from: 'bot', reply }])
    } finally {
      setThinking(false)
    }
  }

  // Pergunta enviada de outro lugar (ex.: "Perguntar ao assistente" com texto)
  useEffect(() => {
    if (assistantOpen && pendingQuestion) {
      consumeQuestion()
      void ask(pendingQuestion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantOpen, pendingQuestion])

  function run(a: AssistantAction) {
    if (a.type === 'link') {
      navigate(a.href)
      // No celular a janela cobre a tela: fecha para mostrar a página
      if (window.innerWidth < 640) closeAssistant()
    } else if (a.type === 'guide') {
      closeAssistant()
      start(a.tourId, { restart: true })
    } else openDemo(a.demoId)
  }

  function close() {
    closeAssistant()
    launcherRef.current?.focus()
  }

  const suggestions = suggestionsFor(pathname, tenant.role)

  return (
    <>
      {!assistantOpen && !tourActive && (
        <motion.button
          ref={launcherRef}
          type="button"
          onClick={() => openAssistant()}
          initial={reduce ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={reduce ? undefined : { scale: 0.94 }}
          className="bg-inverse text-inverse-foreground shadow-lift focus-visible:ring-ring fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 lg:bottom-6 lg:right-6"
          aria-label="Abrir o assistente de ajuda"
          data-tour="assistant-launcher"
        >
          <MessageCircleQuestion className="h-5 w-5" />
        </motion.button>
      )}

      <AnimatePresence>
        {assistantOpen && (
          <motion.section
            role="dialog"
            aria-label="Assistente de ajuda"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            className="bg-card shadow-lift fixed inset-0 z-50 flex flex-col sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(600px,calc(100dvh-6rem))] sm:w-[400px] sm:rounded-2xl sm:border"
          >
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <span className="bg-inverse text-inverse-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                <LifeBuoy className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="letters text-base leading-none">Assistente</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Respostas da central de ajuda do Marcaí
                </p>
              </div>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setMessages([])}
                  aria-label="Começar nova conversa"
                >
                  <RotateCcw />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={close}
                aria-label="Fechar o assistente"
              >
                <X />
              </Button>
            </header>

            <div
              ref={listRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
              aria-live="polite"
            >
              <BotBubble>
                <p>
                  Oi! Pergunte como fazer qualquer coisa no painel. Eu procuro na central de ajuda e
                  te levo até o lugar certo.
                </p>
              </BotBubble>
              {messages.map((m) =>
                m.from === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm">
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <BotBubble key={m.id}>
                    <p>{m.reply.text}</p>
                    {m.reply.steps && (
                      <ol className="mt-2 list-decimal space-y-1 pl-4">
                        {m.reply.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                    )}
                    {m.reply.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {m.reply.actions.map((a) => (
                          <Button
                            key={a.label}
                            size="sm"
                            variant={a.type === 'guide' ? 'default' : 'outline'}
                            onClick={() => run(a)}
                          >
                            {a.type === 'guide' || a.type === 'demo' ? <Play /> : <BookOpen />}
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    )}
                    {m.reply.related.length > 0 && (
                      <div className="mt-3">
                        <p className="text-muted-foreground text-xs font-medium">
                          Também pode ajudar
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {m.reply.related.map((r) => (
                            <li key={r.label}>
                              <button
                                type="button"
                                onClick={() => ask(r.ask)}
                                className="text-cobalt text-left text-xs font-semibold underline-offset-4 hover:underline"
                              >
                                {r.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </BotBubble>
                ),
              )}
              {thinking && (
                <BotBubble>
                  <span className="text-muted-foreground">Procurando…</span>
                </BotBubble>
              )}
              {messages.length === 0 && (
                <div className="pt-1">
                  <p className="text-muted-foreground mb-2 text-xs font-medium">Perguntas comuns</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => ask(s)}
                        className="hover:bg-muted focus-visible:ring-ring rounded-full border px-3 py-1.5 text-left text-xs font-medium outline-none transition-colors focus-visible:ring-2"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <form
              className="pb-safe flex items-end gap-2 border-t p-3"
              onSubmit={(e) => {
                e.preventDefault()
                void ask(input)
              }}
            >
              <label htmlFor="assistant-input" className="sr-only">
                Sua pergunta
              </label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={300}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void ask(input)
                  }
                }}
                placeholder="Ex.: como bloquear uma folga?"
                className="bg-background focus-visible:border-primary max-h-28 min-h-11 flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-base outline-none sm:text-sm"
              />
              <Button
                type="submit"
                size="icon"
                className={cn('shrink-0 rounded-xl')}
                disabled={!input.trim() || thinking}
                aria-label="Enviar pergunta"
              >
                <ArrowUp />
              </Button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  )
}

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span
        className="bg-muted mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        aria-hidden
      >
        <LifeBuoy className="h-3 w-3" />
      </span>
      <div className="bg-muted/70 max-w-[88%] rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed">
        {children}
      </div>
    </div>
  )
}

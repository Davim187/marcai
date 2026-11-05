import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  BellRing,
  CalendarCheck2,
  Check,
  Clock,
  Link2,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  UserX,
} from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { formatBRL, PLANS } from '@marcai/shared'
import { LogoMark } from '@/components/logo'
import { cn } from '@/lib/utils'

/*
 * Mundo visual da landing: o cartão de retorno que o salão entrega no balcão.
 * Cartão verde como chão, cartão branco como objeto, preto de impressão e
 * azul de carimbo. Estado é dito pelo carimbo, nunca só pela cor.
 */

const STEPS = [
  {
    icon: Sparkles,
    title: 'Cadastre seus serviços e horários',
    text: 'Em menos de 3 minutos. Já deixamos serviços e perguntas sugeridos para a sua área.',
  },
  {
    icon: Link2,
    title: 'Coloque o link na bio',
    text: 'marcai.app/seunome no Instagram, no WhatsApp e no QR Code do balcão.',
  },
  {
    icon: BellRing,
    title: 'Receba os agendamentos',
    text: 'A cliente escolhe um horário livre e você recebe o aviso na hora, com todos os detalhes.',
  },
]
const BENEFITS = [
  {
    icon: MessageCircle,
    title: 'Chega de responder mensagem',
    text: 'Nada de “tem horário amanhã?”. A cliente vê só os horários livres e agenda sozinha, até de madrugada.',
  },
  {
    icon: ShieldCheck,
    title: 'Nunca mais horário duplicado',
    text: 'O sistema trava o horário no momento da reserva. Duas clientes nunca ficam no mesmo horário.',
  },
  {
    icon: BellRing,
    title: 'Aviso no seu WhatsApp',
    text: 'Nome, telefone, serviço, data e as respostas do formulário chegam direto no seu celular.',
  },
  {
    icon: UserX,
    title: 'Menos faltas',
    text: 'Lembrete automático no WhatsApp da cliente, com botão para confirmar presença ou remarcar.',
  },
]
const FAQ = [
  [
    'Preciso de cartão para testar?',
    'Não. Você usa tudo, inclusive os recursos do plano Pro, por 30 dias grátis. Só escolhe um plano se gostar.',
  ],
  [
    'Minha cliente precisa baixar aplicativo ou criar conta?',
    'Não. Ela abre o link, escolhe o horário, preenche nome e WhatsApp e pronto. Funciona em qualquer celular.',
  ],
  [
    'E se eu ainda marcar algumas clientes pelo WhatsApp?',
    'Sem problema: você cria o agendamento manual pelo painel em segundos e o horário sai da agenda online.',
  ],
  [
    'Consigo bloquear horários para folga ou médico?',
    'Sim. Bloqueios pontuais, pausas fixas (como almoço) e feriados nacionais já carregados.',
  ],
  [
    'Como funcionam os pagamentos?',
    'Por PIX, boleto ou cartão, todo mês. Você pode trocar de plano ou cancelar quando quiser.',
  ],
  [
    'Funciona para equipe?',
    'Sim. Cada profissional tem a própria agenda, serviços e expediente, e a cliente escolhe com quem quer agendar.',
  ],
  [
    'Meus dados e os das minhas clientes estão seguros?',
    'Sim. Seguimos a LGPD: as clientes dão consentimento ao agendar e você pode exportar ou excluir os dados quando quiser.',
  ],
]
const SLOTS = ['08:00', '09:30', '10:00', '13:30', '14:00', '15:30', '16:00', '17:30']
const PICKED = '14:00'
const EASE = [0.16, 1, 0.3, 1] as const

/** Botão impresso: cheio (verde do cartão) ou só contorno de tinta. */
function PrintButton({
  to,
  href,
  children,
  tone = 'stock',
  className,
}: {
  to?: string
  href?: string
  children: React.ReactNode
  tone?: 'stock' | 'outline' | 'card'
  className?: string
}) {
  const cls = cn(
    'inline-flex h-12 items-center justify-center gap-2 rounded-[3px] px-6 text-[15px] font-bold transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-px active:translate-y-0 [&_svg]:size-4',
    tone === 'stock' &&
      'bg-[var(--l-stock)] text-[var(--l-stock-ink)] shadow-[0_6px_14px_-8px_rgba(15,59,45,.8)] hover:bg-[#164d3b]',
    tone === 'outline' &&
      'border-[1.5px] border-[var(--l-ink)] text-[var(--l-ink)] hover:bg-[var(--l-ink)] hover:text-[var(--l-card)]',
    tone === 'card' &&
      'bg-[var(--l-card)] text-[var(--l-ink)] shadow-[0_6px_14px_-8px_rgba(0,0,0,.6)] hover:bg-white',
    className,
  )
  return href ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <Link to={to!} className={cls}>
      {children}
    </Link>
  )
}

/** Carimbo retangular de borda dupla, em tinta azul. */
function Stamp({
  children,
  className,
  rotate = -7,
  animate = false,
}: {
  children: React.ReactNode
  className?: string
  rotate?: number
  animate?: boolean
}) {
  const reduce = useReducedMotion()
  const still = !animate || reduce
  return (
    <motion.span
      initial={still ? false : { opacity: 0, scale: 1.45, rotate: rotate - 6, filter: 'blur(3px)' }}
      animate={{ opacity: 1, scale: 1, rotate, filter: 'blur(0px)' }}
      transition={{ delay: 1.15, duration: 0.42, ease: EASE }}
      style={{ rotate }}
      className={cn(
        'pointer-events-none inline-block select-none rounded-[4px] border-[2.5px] border-[var(--l-stamp)] p-[3px] text-[var(--l-stamp)] mix-blend-multiply',
        className,
      )}
    >
      <span className="xwide block rounded-[2px] border border-[var(--l-stamp)] px-3 py-1.5 text-center text-xs font-black uppercase leading-tight tracking-[0.08em]">
        {children}
      </span>
    </motion.span>
  )
}

/** O cartão do salão de demonstração: serviços, horários e o pedido carimbado. */
function SalonStub() {
  const reduce = useReducedMotion()
  return (
    <div className="relative flex flex-col p-6 text-[var(--l-ink)] sm:p-7">
      <p className="wide text-lg font-extrabold leading-tight">Studio Vértice</p>
      <p className="text-sm text-[var(--l-ink-muted)]">Unhas, cabelo e estética</p>

      <ul className="mt-5 space-y-2.5 text-sm">
        {[
          ['Corte + barba', 'R$ 70', '1h'],
          ['Escova', 'a partir de R$ 60', '45 min'],
        ].map(([n, p, d]) => (
          <li key={n}>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">{n}</span>
              <span className="dot-leader" aria-hidden />
              <span className="font-bold tabular-nums">{p}</span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--l-ink-muted)]">
              <Clock className="h-3 w-3" aria-hidden />
              {d}
            </p>
          </li>
        ))}
      </ul>

      <p className="xwide mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--l-ink-muted)]">
        Quinta, 6 de novembro
      </p>
      <div className="mt-2 grid grid-cols-4 border-l border-t border-[var(--l-rule)]">
        {SLOTS.map((t) => (
          <span
            key={t}
            className={cn(
              'font-typed relative border-b border-r border-[var(--l-rule)] py-2 text-center text-sm tabular-nums',
              t === PICKED && 'font-bold text-[var(--l-stamp)]',
            )}
          >
            {t}
            {t === PICKED && (
              <svg
                viewBox="0 0 64 34"
                className="pointer-events-none absolute -inset-x-1 -inset-y-0.5 h-[calc(100%+4px)] w-[calc(100%+8px)] overflow-visible"
                aria-hidden
              >
                <motion.path
                  d="M8 9C18 1 50 0 58 9c7 9-6 21-27 22C10 32 1 24 4 15 6 9 15 5 26 4"
                  fill="none"
                  stroke="var(--l-stamp)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.55, duration: 0.5, ease: EASE }}
                />
              </svg>
            )}
          </span>
        ))}
      </div>

      <dl className="mt-6 space-y-2 text-sm">
        {[
          ['Cliente', 'Ana Souza'],
          ['Serviço', 'Corte + barba'],
          ['Dia', 'Quinta, 06/11 · 14:00'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-3 border-b border-[var(--l-rule)] pb-1">
            <dt className="w-16 shrink-0 text-xs text-[var(--l-ink-muted)]">{k}</dt>
            <dd className="font-typed text-[15px] text-[var(--l-stamp)]">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 rounded-[3px] border-[1.5px] border-[var(--l-ink)] py-2 text-center text-sm font-bold">
        Confirmar agendamento
      </p>

      <Stamp animate rotate={-8} className="mr-1 mt-3 self-end bg-[var(--l-card)]">
        <MessageCircle className="mx-auto mb-0.5 h-3.5 w-3.5" aria-hidden />
        Novo agendamento!
      </Stamp>
    </div>
  )
}

export default function LandingPage() {
  useEffect(() => {
    document.title = 'Marcaí — Sua agenda cheia, sem precisar responder mensagem'
  }, [])
  return (
    <div className="landing min-h-dvh">
      <header className="bg-[var(--l-stock)]/95 sticky top-0 z-30 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2" aria-label="Marcaí, início">
            <LogoMark className="h-8 w-8 rounded-lg ring-1 ring-[var(--l-stock-rule)]" />
            <span className="xwide text-xl font-black tracking-tight">Marcaí</span>
          </Link>
          <nav
            className="hidden items-center gap-7 text-sm font-medium text-[var(--l-stock-muted)] md:flex"
            aria-label="Seções"
          >
            {[
              ['#como-funciona', 'Como funciona'],
              ['#beneficios', 'Benefícios'],
              ['#planos', 'Planos'],
              ['#duvidas', 'Dúvidas'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="underline-offset-[6px] transition-colors hover:text-[var(--l-stock-ink)] hover:underline"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-5">
            <Link
              to="/entrar"
              className="text-sm font-semibold underline-offset-[6px] hover:underline"
            >
              Entrar
            </Link>
            <PrintButton
              to="/cadastro"
              tone="card"
              className="hidden h-10 px-4 text-sm sm:inline-flex"
            >
              Começar grátis
            </PrintButton>
          </div>
        </div>
      </header>

      <main>
        {/* Abertura: o próprio cartão de retorno, com o canhoto do salão */}
        <section className="pb-16 pt-6 sm:pb-24 sm:pt-10">
          <div className="container">
            <div className="on-card grid overflow-hidden rounded-[6px] bg-[var(--l-card)] text-[var(--l-ink)] shadow-[0_40px_70px_-40px_rgba(0,0,0,.75)] lg:grid-cols-[1fr_340px]">
              <div className="flex flex-col p-6 sm:p-10 lg:p-12">
                <h1 className="wide max-w-[17ch] text-[clamp(2.4rem,5vw,4.25rem)] font-extrabold leading-[1] tracking-[-0.035em]">
                  Sua agenda cheia, sem precisar responder mensagem.
                </h1>
                <p className="mt-7 max-w-[46ch] text-lg leading-relaxed text-[var(--l-ink-muted)]">
                  Coloque seu link na bio do Instagram. A cliente escolhe o serviço, vê só os
                  horários livres e agenda sozinha. Você recebe o aviso na hora, até no WhatsApp.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <PrintButton to="/cadastro">
                    Começar grátis por 30 dias <ArrowRight aria-hidden />
                  </PrintButton>
                  <PrintButton href="/studiovertice" tone="outline">
                    Ver uma página de exemplo
                  </PrintButton>
                </div>
                <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
                  {['Sem cartão', 'Pronto em 3 minutos', 'Cancele quando quiser'].map((t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-[var(--l-stamp)]" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
                <p className="xwide mt-10 border-t border-[var(--l-rule)] pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--l-ink-muted)] lg:mt-auto">
                  Para salões, barbearias, estúdios e profissionais de beleza
                </p>
              </div>
              {/* Picote entre o cartão e o canhoto */}
              <div className="relative border-t border-dashed border-[var(--l-rule)] lg:border-t-0">
                <span
                  className="perf-v absolute inset-y-6 left-0 hidden w-[1.5px] lg:block"
                  aria-hidden
                />
                <span
                  className="absolute -left-3 -top-3 hidden h-6 w-6 rounded-full bg-[var(--l-stock)] lg:block"
                  aria-hidden
                />
                <span
                  className="absolute -bottom-3 -left-3 hidden h-6 w-6 rounded-full bg-[var(--l-stock)] lg:block"
                  aria-hidden
                />
                <SalonStub />
              </div>
            </div>
          </div>
        </section>

        {/* Como funciona: três canhotos destacáveis, numerados */}
        <section
          id="como-funciona"
          className="scroll-mt-16 bg-[var(--l-card)] py-20 text-[var(--l-ink)] sm:py-28"
        >
          <div className="container">
            <div className="grid gap-4 lg:grid-cols-12">
              <h2 className="wide text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl lg:col-span-5">
                Como funciona
              </h2>
              <p className="max-w-md text-lg text-[var(--l-ink-muted)] lg:col-span-6 lg:col-start-7 lg:self-end">
                Três passos e sua agenda começa a se encher sozinha.
              </p>
            </div>
            <ol className="mt-12">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="grid items-baseline gap-x-8 gap-y-2 border-t-[1.5px] border-dashed border-[var(--l-rule)] py-8 last:border-b-[1.5px] sm:grid-cols-[7rem_1fr] lg:grid-cols-[9rem_5fr_6fr]"
                >
                  <span
                    className="xwide text-7xl font-black tabular-nums leading-none text-[var(--l-stock)] sm:text-8xl"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <h3 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
                    <s.icon className="h-5 w-5 shrink-0 text-[var(--l-stamp)]" aria-hidden />
                    <span>
                      <span className="sr-only">Passo {i + 1}: </span>
                      {s.title}
                    </span>
                  </h3>
                  <p className="text-lg text-[var(--l-ink-muted)] sm:col-start-2 lg:col-start-3">
                    {s.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Benefícios: cartão fidelidade, um carimbo por benefício */}
        <section id="beneficios" className="scroll-mt-16 py-20 sm:py-28">
          <div className="container">
            <h2 className="wide max-w-[16ch] text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              Feito para quem vive de agenda
            </h2>
            <div className="on-card mt-12 grid overflow-hidden rounded-[6px] bg-[var(--l-card)] text-[var(--l-ink)] shadow-[0_40px_70px_-40px_rgba(0,0,0,.75)] sm:grid-cols-2">
              {BENEFITS.map((b, i) => (
                <div
                  key={b.title}
                  className={cn(
                    'flex gap-5 p-7 sm:p-9',
                    i > 0 && 'border-t border-[var(--l-rule)]',
                    i === 1 && 'sm:border-t-0',
                    i % 2 === 1 && 'sm:border-l',
                  )}
                >
                  <span
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[2.5px] border-[var(--l-stamp)] text-[var(--l-stamp)] mix-blend-multiply [&_svg]:size-7"
                    style={{ transform: `rotate(${[-9, 6, -4, 11][i]}deg)` }}
                    aria-hidden
                  >
                    <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-dashed border-[var(--l-stamp)]">
                      <b.icon />
                    </span>
                  </span>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">{b.title}</h3>
                    <p className="mt-2 text-[var(--l-ink-muted)]">{b.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Planos: tabela de preços do balcão */}
        <section
          id="planos"
          className="scroll-mt-16 bg-[var(--l-card)] py-20 text-[var(--l-ink)] sm:py-28"
        >
          <div className="container">
            <div className="grid gap-4 lg:grid-cols-12">
              <h2 className="wide text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl lg:col-span-6">
                Planos simples, sem surpresa
              </h2>
              <p className="max-w-md text-lg text-[var(--l-ink-muted)] lg:col-span-5 lg:col-start-8 lg:self-end">
                Comece com 30 dias grátis de tudo. Depois, escolha o plano que faz sentido para
                você.
              </p>
            </div>
            <div className="mt-12 grid border-y-[1.5px] border-[var(--l-ink)] md:grid-cols-2">
              {Object.values(PLANS).map((p, i) => (
                <div
                  key={p.id}
                  className={cn(
                    'relative flex flex-col py-9 md:px-10',
                    i === 0
                      ? 'md:pl-0'
                      : 'border-t border-[var(--l-rule)] md:border-l md:border-t-0 md:pr-0',
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="xwide text-2xl font-black uppercase tracking-[0.02em]">
                      {p.name}
                    </h3>
                    <span className="dot-leader hidden sm:block" aria-hidden />
                    <p className="whitespace-nowrap max-sm:w-full">
                      <span className="wide text-4xl font-extrabold tabular-nums tracking-[-0.03em] sm:text-5xl">
                        {formatBRL(p.priceCents).replace(',00', '')}
                      </span>
                      <span className="text-[var(--l-ink-muted)]">/mês</span>
                    </p>
                  </div>
                  <p className="mt-2 text-[var(--l-ink-muted)]">{p.tagline}</p>
                  {p.id === 'pro' && (
                    <Stamp
                      rotate={-6}
                      className="absolute -top-5 right-3 bg-[var(--l-card)] md:right-6"
                    >
                      Mais escolhido
                    </Stamp>
                  )}
                  <ul className="mt-7 flex-1 space-y-3">
                    {p.highlights.map((h) => (
                      <li key={h} className="flex gap-2.5">
                        <Check
                          className="mt-1 h-4 w-4 shrink-0 text-[var(--l-stamp)]"
                          aria-hidden
                        />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <PrintButton
                    to="/cadastro"
                    tone={p.id === 'pro' ? 'stock' : 'outline'}
                    className="mt-9 w-full sm:w-auto sm:self-start"
                  >
                    Começar grátis
                  </PrintButton>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Dúvidas: folha pautada */}
        <section id="duvidas" className="scroll-mt-16 py-20 sm:py-28">
          <div className="container grid gap-10 lg:grid-cols-12">
            <h2 className="wide text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl lg:col-span-4">
              Dúvidas frequentes
            </h2>
            <div className="border-t-[1.5px] border-[var(--l-stock-muted)] lg:col-span-8">
              {FAQ.map(([q, a]) => (
                <details
                  key={q}
                  className="group border-b border-[var(--l-stock-rule)] [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-semibold transition-colors hover:text-white">
                    {q}
                    <Plus
                      className="h-5 w-5 shrink-0 text-[var(--l-stock-muted)] transition-transform duration-300 group-open:rotate-45"
                      aria-hidden
                    />
                  </summary>
                  <p className="max-w-[60ch] pb-6 text-[var(--l-stock-muted)]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Fechamento: o verso do cartão, com o carimbo do convite */}
        <section className="pb-20 sm:pb-28">
          <div className="container">
            {/* Fio de impressão por dentro da borda do cartão (outline, não um segundo cartão) */}
            <div className="on-card flex flex-col items-start gap-8 rounded-[6px] bg-[var(--l-card)] p-10 text-[var(--l-ink)] shadow-[0_40px_70px_-40px_rgba(0,0,0,.75)] outline outline-[1.5px] outline-offset-[-14px] outline-[var(--l-ink)] sm:p-16 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CalendarCheck2 className="h-9 w-9 text-[var(--l-stamp)]" aria-hidden />
                <h2 className="wide mt-5 max-w-[18ch] text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
                  Sua próxima cliente pode agendar hoje.
                </h2>
                <p className="mt-4 max-w-[48ch] text-lg text-[var(--l-ink-muted)]">
                  Crie sua página em 3 minutos e coloque o link na bio. É grátis por 30 dias.
                </p>
              </div>
              <PrintButton to="/cadastro" className="h-14 shrink-0 px-7 text-base">
                Criar minha agenda grátis <ArrowRight aria-hidden />
              </PrintButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="perf-h bg-top py-10">
        <div className="container flex flex-col items-start justify-between gap-5 text-sm text-[var(--l-stock-muted)] sm:flex-row sm:items-center">
          <span className="flex items-center gap-2 text-[var(--l-stock-ink)]">
            <LogoMark className="h-7 w-7 rounded-lg ring-1 ring-[var(--l-stock-rule)]" />
            <span className="xwide text-lg font-black">Marcaí</span>
          </span>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Rodapé">
            <Link
              to="/termos"
              className="underline-offset-[5px] hover:text-[var(--l-stock-ink)] hover:underline"
            >
              Termos de uso
            </Link>
            <Link
              to="/privacidade"
              className="underline-offset-[5px] hover:text-[var(--l-stock-ink)] hover:underline"
            >
              Privacidade (LGPD)
            </Link>
            <Link
              to="/entrar"
              className="underline-offset-[5px] hover:text-[var(--l-stock-ink)] hover:underline"
            >
              Entrar
            </Link>
          </nav>
          <p>© {new Date().getFullYear()} Marcaí. Feito no Brasil</p>
        </div>
      </footer>
    </div>
  )
}

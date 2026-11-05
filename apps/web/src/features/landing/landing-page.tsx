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
 * Mundo visual: o quadro de letras do salão. Feltro grafite com letras brancas de encaixe
 * e feltros coloridos (cobalto, mostarda, rosa, terracota), cada um com papel fixo.
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
const HEADLINE = 'Sua agenda cheia, sem precisar responder mensagem.'

/** Cor de feltro por posição: cada item ganha a sua, sempre na mesma ordem. */
const FELT = [
  'bg-cobalt text-cobalt-foreground',
  'bg-mustard text-mustard-foreground',
  'bg-pink text-pink-foreground',
  'bg-terra text-terra-foreground',
]

function CTA({
  to,
  href,
  children,
  tone = 'mustard',
  className,
}: {
  to?: string
  href?: string
  children: React.ReactNode
  tone?: 'mustard' | 'felt' | 'ghost-light' | 'ghost-dark'
  className?: string
}) {
  const cls = cn(
    'inline-flex h-12 items-center justify-center gap-2 rounded-md px-6 text-[15px] font-semibold transition-[transform,background-color,color] duration-200 hover:-translate-y-px active:translate-y-0 [&_svg]:size-4',
    tone === 'mustard' && 'bg-mustard text-mustard-foreground hover:bg-[#EDB63A]',
    tone === 'felt' && 'bg-primary text-primary-foreground hover:bg-primary/90',
    tone === 'ghost-light' &&
      'border-[1.5px] border-white/70 text-white hover:bg-white hover:text-[#1B1D21]',
    tone === 'ghost-dark' &&
      'border-[1.5px] border-foreground/80 text-foreground hover:bg-foreground hover:text-background',
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

/** A frase do quadro: as palavras encaixam nas canaletas uma a uma, uma vez só. */
function BoardHeadline() {
  const reduce = useReducedMotion()
  const words = HEADLINE.split(' ')
  return (
    <h1 className="letters max-w-[16ch] text-[clamp(2.6rem,6.4vw,5.5rem)] leading-[0.92] tracking-[0.03em] text-white">
      <span className="sr-only">{HEADLINE}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <motion.span
            key={i}
            className="mr-[0.28em] inline-block"
            initial={reduce ? false : { opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 + i * 0.07, duration: 0.45, ease: EASE }}
          >
            {w}
          </motion.span>
        ))}
      </span>
    </h1>
  )
}

/** A página do salão de exemplo, presa ao pé do quadro. */
function SalonCard() {
  const reduce = useReducedMotion()
  return (
    <div className="bg-card text-card-foreground shadow-lift relative rounded-md p-6 sm:p-7">
      <motion.span
        initial={reduce ? false : { opacity: 0, scale: 0.8, rotate: -2 }}
        animate={{ opacity: 1, scale: 1, rotate: 3 }}
        transition={{ delay: 1.1, duration: 0.4, ease: EASE }}
        className="bg-pink text-pink-foreground letters shadow-soft absolute -right-3 -top-4 flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm"
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        Novo agendamento!
      </motion.span>
      <p className="letters text-2xl leading-none">Studio Vértice</p>
      <p className="text-muted-foreground mt-1 text-sm">Unhas, cabelo e estética</p>

      <ul className="mt-5 space-y-3">
        {[
          ['Corte + barba', 'R$ 70', '1h', 0],
          ['Escova', 'a partir de R$ 60', '45 min', 2],
        ].map(([n, p, d, c]) => (
          <li key={n as string} className="flex items-start gap-3">
            <span
              className={cn('mt-1 h-3 w-3 shrink-0 rounded-sm', FELT[c as number])}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{n}</span>
                <span className="font-semibold tabular-nums">{p}</span>
              </div>
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" aria-hidden />
                {d}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="letters text-muted-foreground mt-6 text-sm">Quinta, 6 de novembro</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {SLOTS.map((t) => (
          <span
            key={t}
            className={cn(
              'rounded-sm border py-2 text-center text-sm font-semibold tabular-nums',
              t === PICKED && 'bg-cobalt text-cobalt-foreground border-cobalt',
            )}
          >
            {t}
          </span>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {[
          ['Cliente', 'Ana Souza'],
          ['Serviço', 'Corte + barba'],
          ['Dia', 'Quinta, 06/11 · 14:00'],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="bg-primary text-primary-foreground mt-6 rounded-md py-2.5 text-center text-sm font-semibold">
        Confirmar agendamento
      </p>
    </div>
  )
}

export default function LandingPage() {
  useEffect(() => {
    document.title = 'Marcaí — Sua agenda cheia, sem precisar responder mensagem'
  }, [])
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <header className="felt sticky top-0 z-30">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2" aria-label="Marcaí, início">
            <LogoMark className="h-8 w-8 rounded-[5px] ring-1 ring-white/25" />
            <span className="letters text-2xl">Marcaí</span>
          </Link>
          <nav
            className="text-sidebar-muted hidden items-center gap-7 text-sm font-medium md:flex"
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
                className="underline-offset-[6px] transition-colors hover:text-white hover:underline"
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
            <CTA to="/cadastro" className="hidden h-10 px-4 text-sm sm:inline-flex">
              Começar grátis
            </CTA>
          </div>
        </div>
      </header>

      <main>
        {/* Abertura: o quadro de letras, com a página do salão presa embaixo */}
        <section className="pt-6 sm:pt-10">
          <div className="container">
            <div className="felt rounded-md p-7 shadow-[inset_0_0_0_10px_#3A3E44] sm:p-12 lg:px-16 lg:pb-40 lg:pt-16">
              <BoardHeadline />
              <p className="letters text-mustard mt-8 text-sm sm:text-base">
                Para salões, barbearias, estúdios e profissionais de beleza
              </p>
            </div>
            <div className="grid gap-10 pb-16 pt-10 sm:pb-24 lg:grid-cols-[1fr_380px] lg:gap-16 lg:pt-12">
              <div className="lg:pl-16">
                <p className="max-w-[44ch] text-xl leading-relaxed">
                  Coloque seu link na bio do Instagram. A cliente escolhe o serviço, vê só os
                  horários livres e agenda sozinha. Você recebe o aviso na hora, até no WhatsApp.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <CTA to="/cadastro" tone="felt">
                    Começar grátis por 30 dias <ArrowRight aria-hidden />
                  </CTA>
                  <CTA href="/studiovertice" tone="ghost-dark">
                    Ver uma página de exemplo
                  </CTA>
                </div>
                <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
                  {['Sem cartão', 'Pronto em 3 minutos', 'Cancele quando quiser'].map((t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <Check className="text-green h-4 w-4" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:-mt-44 lg:mr-10">
                <SalonCard />
              </div>
            </div>
          </div>
        </section>

        {/* Como funciona: cada passo numa plaquinha de feltro colorida */}
        <section id="como-funciona" className="bg-card scroll-mt-16 border-y py-20 sm:py-28">
          <div className="container">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="letters text-5xl leading-none sm:text-6xl">Como funciona</h2>
              <p className="text-muted-foreground max-w-sm text-lg">
                Três passos e sua agenda começa a se encher sozinha.
              </p>
            </div>
            <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span
                    className={cn(
                      'letters flex h-20 w-20 items-center justify-center rounded-md text-6xl leading-none',
                      FELT[i],
                    )}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-6 flex items-center gap-2 text-xl font-semibold">
                    <s.icon className="text-muted-foreground h-5 w-5 shrink-0" aria-hidden />
                    <span>
                      <span className="sr-only">Passo {i + 1}: </span>
                      {s.title}
                    </span>
                  </h3>
                  <p className="text-muted-foreground mt-2 text-lg">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Benefícios: escritos no quadro, um feltro por linha */}
        <section id="beneficios" className="scroll-mt-16 py-20 sm:py-28">
          <div className="container">
            <div className="felt rounded-md p-7 shadow-[inset_0_0_0_10px_#3A3E44] sm:p-12 lg:p-16">
              <h2 className="letters max-w-[14ch] text-5xl leading-none text-white sm:text-6xl">
                Feito para quem vive de agenda
              </h2>
              <ul className="mt-12 grid gap-x-14 gap-y-10 md:grid-cols-2">
                {BENEFITS.map((b, i) => (
                  <li key={b.title} className="flex gap-5">
                    <span
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-md [&_svg]:size-6',
                        FELT[i],
                      )}
                      aria-hidden
                    >
                      <b.icon />
                    </span>
                    <div>
                      <h3 className="letters text-2xl leading-tight text-white">{b.title}</h3>
                      <p className="text-sidebar-muted mt-2 text-[17px]">{b.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Planos: um em papel, o mais escolhido no feltro */}
        <section id="planos" className="bg-card scroll-mt-16 border-y py-20 sm:py-28">
          <div className="container">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="letters max-w-[18ch] text-5xl leading-none sm:text-6xl">
                Planos simples, sem surpresa
              </h2>
              <p className="text-muted-foreground max-w-sm text-lg">
                Comece com 30 dias grátis de tudo. Depois, escolha o plano que faz sentido para
                você.
              </p>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-2">
              {Object.values(PLANS).map((p) => {
                const pro = p.id === 'pro'
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'relative flex flex-col rounded-md p-8 sm:p-10',
                      pro ? 'felt text-white' : 'bg-background border',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="letters text-3xl leading-none">{p.name}</h3>
                      {pro && (
                        <span className="bg-mustard text-mustard-foreground letters rounded-sm px-3 py-1 text-sm">
                          Mais escolhido
                        </span>
                      )}
                    </div>
                    <p className={cn('mt-2', pro ? 'text-sidebar-muted' : 'text-muted-foreground')}>
                      {p.tagline}
                    </p>
                    <p className="mt-6 flex items-baseline gap-1">
                      <span className="letters text-6xl tabular-nums leading-none">
                        {formatBRL(p.priceCents).replace(',00', '')}
                      </span>
                      <span className={pro ? 'text-sidebar-muted' : 'text-muted-foreground'}>
                        /mês
                      </span>
                    </p>
                    <ul className="mt-8 flex-1 space-y-3">
                      {p.highlights.map((h) => (
                        <li key={h} className="flex gap-2.5">
                          <Check
                            className={cn(
                              'mt-1 h-4 w-4 shrink-0',
                              pro ? 'text-mustard' : 'text-green',
                            )}
                            aria-hidden
                          />
                          {h}
                        </li>
                      ))}
                    </ul>
                    <CTA
                      to="/cadastro"
                      tone={pro ? 'mustard' : 'felt'}
                      className="mt-9 w-full sm:w-auto sm:self-start"
                    >
                      Começar grátis
                    </CTA>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Dúvidas */}
        <section id="duvidas" className="scroll-mt-16 py-20 sm:py-28">
          <div className="container grid gap-10 lg:grid-cols-12">
            <h2 className="letters text-5xl leading-none sm:text-6xl lg:col-span-4">
              Dúvidas frequentes
            </h2>
            <div className="border-foreground border-t-2 lg:col-span-8">
              {FAQ.map(([q, a]) => (
                <details
                  key={q}
                  className="group border-b [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="hover:text-cobalt flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-semibold transition-colors">
                    {q}
                    <Plus
                      className="text-muted-foreground h-5 w-5 shrink-0 transition-transform duration-300 group-open:rotate-45"
                      aria-hidden
                    />
                  </summary>
                  <p className="text-muted-foreground max-w-[60ch] pb-6 text-[17px]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Fechamento: o quadro mostarda do balcão */}
        <section className="pb-20 sm:pb-28">
          <div className="container">
            <div className="bg-mustard text-mustard-foreground flex flex-col items-start gap-8 rounded-md p-8 sm:p-14 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CalendarCheck2 className="h-9 w-9" aria-hidden />
                <h2 className="letters mt-5 max-w-[16ch] text-5xl leading-[0.95] sm:text-7xl">
                  Sua próxima cliente pode agendar hoje.
                </h2>
                <p className="mt-4 max-w-[48ch] text-lg">
                  Crie sua página em 3 minutos e coloque o link na bio. É grátis por 30 dias.
                </p>
              </div>
              <CTA to="/cadastro" tone="felt" className="h-14 shrink-0 px-7 text-base">
                Criar minha agenda grátis <ArrowRight aria-hidden />
              </CTA>
            </div>
          </div>
        </section>
      </main>

      <footer className="felt py-10">
        <div className="text-sidebar-muted container flex flex-col items-start justify-between gap-5 text-sm sm:flex-row sm:items-center">
          <span className="flex items-center gap-2 text-white">
            <LogoMark className="h-7 w-7 rounded-[5px] ring-1 ring-white/25" />
            <span className="letters text-xl">Marcaí</span>
          </span>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Rodapé">
            <Link to="/termos" className="underline-offset-[5px] hover:text-white hover:underline">
              Termos de uso
            </Link>
            <Link
              to="/privacidade"
              className="underline-offset-[5px] hover:text-white hover:underline"
            >
              Privacidade (LGPD)
            </Link>
            <Link to="/entrar" className="underline-offset-[5px] hover:text-white hover:underline">
              Entrar
            </Link>
          </nav>
          <p>© {new Date().getFullYear()} Marcaí. Feito no Brasil</p>
        </div>
      </footer>
    </div>
  )
}

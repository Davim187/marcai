import { motion } from 'framer-motion'
import {
  ArrowRight,
  BellRing,
  Check,
  ChevronDown,
  Clock,
  Link2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UserX,
} from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { formatBRL, PLANS } from '@marcai/shared'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'

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

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[280px] sm:w-[300px]">
      <div className="bg-primary/15 absolute -inset-10 -z-10 rounded-full blur-3xl" aria-hidden />
      <div className="overflow-hidden rounded-[2.6rem] border-[10px] border-[#14202A] bg-[#F7F9FB] shadow-[0_30px_60px_-20px_hsl(210_40%_15%/.35)]">
        <div className="brand-cover h-20" />
        <div className="-mt-8 flex flex-col items-center px-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] border-4 border-[#F7F9FB] bg-[#E8F1F5] text-xl font-semibold text-[#1F5F7A]">
            V
          </div>
          <p className="mt-2 text-sm font-semibold text-[#13212B]">Studio Vértice</p>
          <p className="text-[10px] text-[#5B6B78]">Cabelo, barba e unhas</p>
        </div>
        <div className="space-y-2 p-3">
          {[
            ['Corte + barba', 'R$ 70', '1h'],
            ['Escova', 'a partir de R$ 60', '45 min'],
          ].map(([n, p, d]) => (
            <div key={n} className="rounded-xl border border-[#E1E7EC] bg-white p-2.5 text-left">
              <p className="text-xs font-semibold text-[#13212B]">{n}</p>
              <p className="mt-0.5 flex gap-2 text-[10px]">
                <span className="font-semibold text-[#1F5F7A]">{p}</span>
                <span className="flex items-center gap-0.5 text-[#5B6B78]">
                  <Clock className="h-2.5 w-2.5" />
                  {d}
                </span>
              </p>
            </div>
          ))}
          <p className="pt-1 text-[10px] font-medium text-[#5B6B78]">Quinta, 6 de novembro</p>
          <div className="grid grid-cols-4 gap-1.5">
            {['08:00', '09:30', '10:00', '13:30', '14:00', '15:30', '16:00', '17:30'].map(
              (t, i) => (
                <span
                  key={t}
                  className={`rounded-lg border py-1.5 text-center font-mono text-[10px] font-medium ${i === 4 ? 'border-[#1F5F7A] bg-[#1F5F7A] text-white' : 'border-[#E1E7EC] bg-white text-[#13212B]'}`}
                >
                  {t}
                </span>
              ),
            )}
          </div>
          <div className="mt-2 rounded-lg bg-[#1F5F7A] py-2 text-center text-xs font-semibold text-white">
            Confirmar agendamento
          </div>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, type: 'spring', stiffness: 180, damping: 20 }}
        className="shadow-lift absolute -right-6 top-44 w-52 rounded-2xl border bg-white p-3 text-left sm:-right-16"
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#13212B]">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#25D366] text-white">
            <MessageCircle className="h-3 w-3" />
          </span>
          Novo agendamento
        </p>
        <p className="mt-1 text-[11px] leading-snug text-[#475569]">
          Ana Souza
          <br />
          Corte + barba
          <br />
          Quinta, 06/11 · 14:00
        </p>
      </motion.div>
    </div>
  )
}

function SectionTitle({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <div>
      <p className="text-primary text-sm font-medium">{kicker}</p>
      <h2 className="mt-2 text-3xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.6rem]">
        {title}
      </h2>
      {text && <p className="text-muted-foreground mt-4 max-w-md text-[1.05rem]">{text}</p>}
    </div>
  )
}

export default function LandingPage() {
  useEffect(() => {
    document.title = 'Marcaí — Sua agenda cheia, sem precisar responder mensagem'
  }, [])
  return (
    <div className="bg-background min-h-dvh">
      <a
        href="#conteudo"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>
      <header className="bg-background/80 sticky top-0 z-30 border-b border-transparent backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav
            className="text-muted-foreground hidden items-center gap-7 text-sm font-medium md:flex"
            aria-label="Seções"
          >
            <a href="#como-funciona" className="hover:text-foreground transition-colors">
              Como funciona
            </a>
            <a href="#beneficios" className="hover:text-foreground transition-colors">
              Benefícios
            </a>
            <a href="#planos" className="hover:text-foreground transition-colors">
              Planos
            </a>
            <a href="#duvidas" className="hover:text-foreground transition-colors">
              Dúvidas
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/entrar">Entrar</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link to="/cadastro">Começar grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="conteudo">
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_85%_10%,hsl(var(--primary)/.12),transparent_70%),radial-gradient(hsl(var(--primary)/.07)_1px,transparent_1px)] [background-size:auto,18px_18px]"
            aria-hidden
          />
          <div className="container grid items-center gap-14 pb-16 pt-12 sm:pb-28 sm:pt-20 lg:grid-cols-[1.15fr_1fr]">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            >
              <p className="text-muted-foreground text-sm font-medium">
                Para salões, barbearias, estúdios e profissionais de beleza
              </p>
              <h1 className="mt-4 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-[4.25rem]">
                Sua agenda cheia, sem precisar responder mensagem.
              </h1>
              <p className="text-muted-foreground mt-6 max-w-[34rem] text-lg leading-relaxed">
                Coloque seu link na bio do Instagram. A cliente escolhe o serviço, vê só os horários
                livres e agenda sozinha. Você recebe o aviso na hora, até no WhatsApp.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild>
                  <Link to="/cadastro">
                    Começar grátis por 30 dias <ArrowRight />
                  </Link>
                </Button>
                <a
                  href="/studiovertice"
                  className="text-foreground hover:text-primary inline-flex h-12 items-center justify-center gap-1.5 px-2 text-sm font-semibold underline-offset-4 transition-colors hover:underline"
                >
                  Ver uma página de exemplo
                </a>
              </div>
              <p className="text-muted-foreground mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {['Sem cartão', 'Pronto em 3 minutos', 'Cancele quando quiser'].map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <Check className="text-primary h-4 w-4" aria-hidden /> {t}
                  </span>
                ))}
              </p>
            </motion.div>
            <PhoneMockup />
          </div>
        </section>

        <section id="como-funciona" className="bg-card border-y py-20 sm:py-28">
          <div className="container grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
            <SectionTitle
              kicker="Como funciona"
              title="Três passos e a agenda começa a se encher sozinha."
            />
            <ol className="divide-y border-y">
              {STEPS.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[3rem_1fr] gap-4 py-7">
                  <span className="text-muted-foreground font-mono text-sm font-medium">
                    0{i + 1}
                  </span>
                  <div>
                    <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.01em]">
                      <s.icon className="text-primary h-5 w-5" aria-hidden />
                      {s.title}
                    </h3>
                    <p className="text-muted-foreground mt-2 max-w-md">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="beneficios" className="py-20 sm:py-28">
          <div className="container">
            <SectionTitle
              kicker="Benefícios"
              title="Feito para quem vive de agenda."
              text="Menos tempo no celular respondendo, mais tempo atendendo."
            />
            <div className="mt-14 grid gap-x-16 gap-y-10 sm:grid-cols-2">
              {BENEFITS.map((b) => (
                <div key={b.title} className="border-t pt-6">
                  <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-xl">
                    <b.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em]">{b.title}</h3>
                  <p className="text-muted-foreground mt-2 max-w-md">{b.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="bg-card border-y py-20 sm:py-28">
          <div className="container">
            <SectionTitle
              kicker="Planos"
              title="Simples, sem surpresa."
              text="Comece com 30 dias grátis de tudo. Depois, escolha o plano que faz sentido para você."
            />
            <div className="mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
              {Object.values(PLANS).map((p) => (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-3xl border p-7 sm:p-8 ${p.id === 'pro' ? 'border-primary/60 bg-primary-soft/60 ring-primary/20 ring-1' : 'bg-background'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">{p.name}</h3>
                    {p.id === 'pro' && (
                      <span className="bg-primary text-primary-foreground rounded-md px-2 py-0.5 text-xs font-semibold">
                        Mais escolhido
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 min-h-[2.5rem] text-sm">{p.tagline}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="text-[2.6rem] font-semibold tracking-[-0.04em]">
                      {formatBRL(p.priceCents).replace(',00', '')}
                    </span>
                    <span className="text-muted-foreground">/mês</span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm">
                    {p.highlights.map((h) => (
                      <li key={h} className="flex gap-2.5">
                        <Check className="text-primary h-4 w-4 shrink-0" aria-hidden />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-8"
                    size="lg"
                    variant={p.id === 'pro' ? 'default' : 'outline'}
                    asChild
                  >
                    <Link to="/cadastro">Começar grátis</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="duvidas" className="py-20 sm:py-28">
          <div className="container grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
            <SectionTitle
              kicker="Dúvidas"
              title="Perguntas que sempre chegam."
              text="Não achou a sua? Fale com a gente pelo WhatsApp depois de criar a conta."
            />
            <div className="divide-y border-y">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="hover:text-primary flex cursor-pointer items-center justify-between gap-4 font-medium transition-colors">
                    {q}
                    <ChevronDown className="text-muted-foreground h-5 w-5 shrink-0 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="text-muted-foreground mt-3 max-w-xl">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-24">
          <div className="container">
            <div className="brand-cover text-primary-foreground flex flex-col gap-8 rounded-[2rem] px-7 py-14 sm:px-14 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="max-w-xl text-3xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.6rem]">
                  Sua próxima cliente pode agendar hoje.
                </h2>
                <p className="mt-4 max-w-lg opacity-85">
                  Crie sua página em 3 minutos e coloque o link na bio. É grátis por 30 dias.
                </p>
              </div>
              <Button size="lg" variant="secondary" className="self-start lg:self-auto" asChild>
                <Link to="/cadastro">
                  Criar minha agenda grátis <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-10">
        <div className="text-muted-foreground container flex flex-col items-center justify-between gap-4 text-sm sm:flex-row">
          <Logo />
          <nav className="flex gap-5" aria-label="Rodapé">
            <Link to="/termos" className="hover:text-foreground">
              Termos de uso
            </Link>
            <Link to="/privacidade" className="hover:text-foreground">
              Privacidade (LGPD)
            </Link>
            <Link to="/entrar" className="hover:text-foreground">
              Entrar
            </Link>
          </nav>
          <p>© {new Date().getFullYear()} Marcaí. Feito no Brasil</p>
        </div>
      </footer>
    </div>
  )
}

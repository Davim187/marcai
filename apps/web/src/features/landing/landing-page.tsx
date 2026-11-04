import { motion } from 'framer-motion'
import {
  ArrowRight,
  BellRing,
  CalendarCheck2,
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
      <div
        className="from-primary/30 absolute -inset-8 -z-10 rounded-full bg-gradient-to-tr via-pink-200/40 to-transparent blur-3xl"
        aria-hidden
      />
      <div className="overflow-hidden rounded-[2.6rem] border-[10px] border-[#2B2024] bg-[#FBF8F6] shadow-2xl">
        <div className="h-20 bg-gradient-to-br from-[#C93C72] to-[#9D174D]" />
        <div className="-mt-8 flex flex-col items-center px-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#FBF8F6] bg-[#FBEAF0] text-xl font-bold text-[#B4235A]">
            M
          </div>
          <p className="mt-2 text-sm font-bold text-[#2B2024]">Mary Lopes Unhas</p>
          <p className="text-[10px] text-[#7A6A70]">Alongamento, gel e spa dos pés 💅</p>
        </div>
        <div className="space-y-2 p-3">
          {[
            ['Alongamento em gel', 'a partir de R$ 150', '2h30'],
            ['Esmaltação em gel', 'R$ 70', '1h'],
          ].map(([n, p, d]) => (
            <div key={n} className="rounded-xl border border-[#EFE6E2] bg-white p-2.5 text-left">
              <p className="text-xs font-semibold text-[#2B2024]">{n}</p>
              <p className="mt-0.5 flex gap-2 text-[10px]">
                <span className="font-bold text-[#B4235A]">{p}</span>
                <span className="flex items-center gap-0.5 text-[#7A6A70]">
                  <Clock className="h-2.5 w-2.5" />
                  {d}
                </span>
              </p>
            </div>
          ))}
          <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#7A6A70]">
            Quinta, 6 de novembro
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {['08:00', '09:30', '10:00', '13:30', '14:00', '15:30', '16:00', '17:30'].map(
              (t, i) => (
                <span
                  key={t}
                  className={`rounded-lg border py-1.5 text-center text-[10px] font-semibold ${i === 4 ? 'border-[#B4235A] bg-[#B4235A] text-white' : 'border-[#EFE6E2] bg-white text-[#2B2024]'}`}
                >
                  {t}
                </span>
              ),
            )}
          </div>
          <div className="mt-2 rounded-lg bg-[#B4235A] py-2 text-center text-xs font-semibold text-white">
            Confirmar agendamento
          </div>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8 }}
        className="shadow-lift absolute -right-6 top-44 w-52 rounded-2xl border bg-white p-3 text-left sm:-right-16"
      >
        <p className="flex items-center gap-1.5 text-xs font-bold text-[#2B2024]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#25D366] text-white">
            <MessageCircle className="h-3 w-3" />
          </span>
          Novo agendamento!
        </p>
        <p className="mt-1 text-[11px] leading-snug text-[#5c4b52]">
          👤 Ana Souza
          <br />✨ Alongamento em gel
          <br />
          📅 Quinta, 06/11 · 14:00
        </p>
      </motion.div>
    </div>
  )
}

export default function LandingPage() {
  useEffect(() => {
    document.title = 'Marcaí — Sua agenda cheia, sem precisar responder mensagem'
  }, [])
  return (
    <div className="bg-background min-h-dvh">
      <header className="bg-background/80 sticky top-0 z-30 border-b border-transparent backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav
            className="text-muted-foreground hidden items-center gap-6 text-sm font-medium md:flex"
            aria-label="Seções"
          >
            <a href="#como-funciona" className="hover:text-foreground">
              Como funciona
            </a>
            <a href="#beneficios" className="hover:text-foreground">
              Benefícios
            </a>
            <a href="#planos" className="hover:text-foreground">
              Planos
            </a>
            <a href="#duvidas" className="hover:text-foreground">
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

      <main>
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,#F7DCE6_0%,transparent_55%)]"
            aria-hidden
          />
          <div className="container grid items-center gap-12 py-12 sm:py-20 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="bg-primary-soft text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" /> Para manicures, cabeleireiras, lash designers e
                barbeiros
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-6xl">
                Sua agenda cheia, sem precisar responder mensagem.
              </h1>
              <p className="text-muted-foreground mt-5 max-w-lg text-lg">
                Coloque seu link na bio do Instagram. A cliente escolhe o serviço, vê só os horários
                livres e agenda sozinha. Você recebe o aviso na hora, até no WhatsApp.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link to="/cadastro">
                    Começar grátis por 30 dias <ArrowRight />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="/marylopes">Ver uma página de exemplo</a>
                </Button>
              </div>
              <p className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5">
                  <Check className="text-success h-4 w-4" /> Sem cartão
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="text-success h-4 w-4" /> Pronto em 3 minutos
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="text-success h-4 w-4" /> Cancele quando quiser
                </span>
              </p>
            </motion.div>
            <PhoneMockup />
          </div>
        </section>

        <section id="como-funciona" className="bg-card border-y py-16 sm:py-24">
          <div className="container">
            <h2 className="text-center text-3xl font-extrabold sm:text-4xl">Como funciona</h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-center">
              Três passos e sua agenda começa a se encher sozinha.
            </p>
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="bg-background relative rounded-3xl border p-6">
                  <span
                    className="text-primary/10 absolute right-5 top-4 text-5xl font-extrabold"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="bg-primary-soft text-primary flex h-12 w-12 items-center justify-center rounded-2xl">
                    <s.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="beneficios" className="py-16 sm:py-24">
          <div className="container">
            <h2 className="text-center text-3xl font-extrabold sm:text-4xl">
              Feito para quem vive de agenda
            </h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {BENEFITS.map((b) => (
                <div
                  key={b.title}
                  className="bg-card shadow-soft flex gap-4 rounded-3xl border p-6"
                >
                  <span className="bg-primary text-primary-foreground flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                    <b.icon className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">{b.title}</h3>
                    <p className="text-muted-foreground mt-1.5">{b.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="bg-card border-y py-16 sm:py-24">
          <div className="container">
            <h2 className="text-center text-3xl font-extrabold sm:text-4xl">
              Planos simples, sem surpresa
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-center">
              Comece com 30 dias grátis de tudo. Depois, escolha o plano que faz sentido para você.
            </p>
            <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
              {Object.values(PLANS).map((p) => (
                <div
                  key={p.id}
                  className={`bg-background relative flex flex-col rounded-3xl border p-7 ${p.id === 'pro' ? 'border-primary shadow-lift ring-primary/30 ring-1' : ''}`}
                >
                  {p.id === 'pro' && (
                    <span className="bg-primary text-primary-foreground absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-bold">
                      Mais escolhido
                    </span>
                  )}
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">{p.tagline}</p>
                  <p className="mt-5">
                    <span className="text-4xl font-extrabold">
                      {formatBRL(p.priceCents).replace(',00', '')}
                    </span>
                    <span className="text-muted-foreground">/mês</span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {p.highlights.map((h) => (
                      <li key={h} className="flex gap-2">
                        <Check className="text-success h-4 w-4 shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-7"
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

        <section id="duvidas" className="py-16 sm:py-24">
          <div className="container max-w-3xl">
            <h2 className="text-center text-3xl font-extrabold sm:text-4xl">Dúvidas frequentes</h2>
            <div className="bg-card mt-10 divide-y rounded-3xl border">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                    {q}
                    <ChevronDown className="text-muted-foreground h-5 w-5 shrink-0 transition group-open:rotate-180" />
                  </summary>
                  <p className="text-muted-foreground mt-3">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="container">
            <div className="rounded-[2rem] bg-gradient-to-br from-[#B4235A] to-[#7A1840] px-6 py-14 text-center text-white sm:px-12">
              <CalendarCheck2 className="mx-auto h-10 w-10 opacity-90" />
              <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
                Sua próxima cliente pode agendar hoje.
              </h2>
              <p className="mx-auto mt-3 max-w-lg opacity-90">
                Crie sua página em 3 minutos e coloque o link na bio. É grátis por 30 dias.
              </p>
              <Button size="lg" variant="secondary" className="mt-8" asChild>
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
          <p>© {new Date().getFullYear()} Marcaí. Feito no Brasil 💖</p>
        </div>
      </footer>
    </div>
  )
}

import { usePublicConfig } from '@/lib/config'
import { LegalLayout } from './legal-layout'

export default function TermsPage() {
  const name = usePublicConfig().data?.appName ?? 'Marcaí'
  return (
    <LegalLayout title="Termos de uso" updated="04/11/2026">
      <p>
        Estes Termos regulam o uso da plataforma {name} (“Plataforma”), que oferece páginas de
        agendamento online e um painel de gestão de agenda para profissionais de beleza
        (“Profissional”) e permite que clientes finais (“Cliente”) agendem atendimentos.
      </p>
      <h2>1. Aceite</h2>
      <p>
        Ao criar uma conta ou agendar um horário, você declara ter lido e concordado com estes
        Termos e com a Política de Privacidade.
      </p>
      <h2>2. Cadastro e conta</h2>
      <ul>
        <li>
          A Profissional deve informar dados verdadeiros e manter a senha em sigilo. Atividades
          feitas com a conta são de sua responsabilidade.
        </li>
        <li>
          É proibido usar a Plataforma para fins ilícitos, envio de spam ou para se passar por outra
          pessoa ou empresa.
        </li>
      </ul>
      <h2>3. Teste grátis, planos e pagamento</h2>
      <ul>
        <li>Novas contas têm 30 dias de teste grátis, sem necessidade de cartão.</li>
        <li>
          Após o teste, o uso continua mediante assinatura mensal de um dos planos vigentes, paga
          por PIX, boleto ou cartão através de intermediador de pagamentos.
        </li>
        <li>
          Com a assinatura vencida há mais de 7 dias, a página pública de agendamento fica
          indisponível e o painel passa a funcionar em modo somente leitura até a regularização.
        </li>
        <li>
          O cancelamento pode ser feito a qualquer momento no painel e vale ao fim do período já
          pago. Não há multa.
        </li>
      </ul>
      <h2>4. Agendamentos</h2>
      <ul>
        <li>
          A Plataforma organiza a agenda e impede reservas simultâneas no mesmo horário, mas a
          prestação do serviço é de responsabilidade exclusiva da Profissional.
        </li>
        <li>
          As regras de cancelamento, remarcação, atrasos e faltas são definidas pela Profissional e
          exibidas à Cliente no momento do agendamento.
        </li>
      </ul>
      <h2>5. Mensagens por WhatsApp e e-mail</h2>
      <p>
        Ao agendar, a Cliente autoriza o envio de mensagens operacionais (confirmação, lembrete,
        cancelamento e remarcação) referentes ao seu agendamento. A Plataforma não envia mensagens
        de marketing em nome da Profissional.
      </p>
      <h2>6. Disponibilidade e responsabilidade</h2>
      <p>
        Empregamos boas práticas para manter a Plataforma disponível e segura, mas não garantimos
        funcionamento ininterrupto. Não nos responsabilizamos por indisponibilidades de serviços de
        terceiros (como operadoras, WhatsApp ou intermediadores de pagamento).
      </p>
      <h2>7. Propriedade intelectual</h2>
      <p>
        O software, a marca e o layout da Plataforma são protegidos. Os conteúdos enviados pela
        Profissional (logo, fotos, textos) continuam sendo dela, que nos concede licença para
        exibi-los na sua página.
      </p>
      <h2>8. Encerramento</h2>
      <p>
        Podemos suspender contas que violem estes Termos. A Profissional pode excluir a conta a
        qualquer momento pelo painel, o que apaga seus dados conforme a Política de Privacidade.
      </p>
      <h2>9. Foro</h2>
      <p>
        Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro do domicílio do
        consumidor para dirimir eventuais controvérsias.
      </p>
    </LegalLayout>
  )
}

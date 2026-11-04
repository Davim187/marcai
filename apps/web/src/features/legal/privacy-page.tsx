import { usePublicConfig } from '@/lib/config'
import { LegalLayout } from './legal-layout'

export default function PrivacyPage() {
  const name = usePublicConfig().data?.appName ?? 'Marcaí'
  return (
    <LegalLayout title="Política de privacidade" updated="04/11/2026">
      <p>
        Esta Política explica como a plataforma {name} trata dados pessoais, em conformidade com a
        Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </p>
      <h2>1. Papéis</h2>
      <ul>
        <li>
          <strong>Dados das Profissionais</strong> (nome, e-mail, telefone, dados de cobrança): a
          Plataforma é a <em>controladora</em>.
        </li>
        <li>
          <strong>Dados das Clientes finais</strong> (nome, WhatsApp, e-mail opcional, observações e
          respostas do formulário): a Profissional é a <em>controladora</em> e a Plataforma atua
          como <em>operadora</em>, tratando os dados apenas para viabilizar os agendamentos.
        </li>
      </ul>
      <h2>2. Quais dados coletamos e por quê</h2>
      <ul>
        <li>Cadastro e acesso da Profissional: execução do contrato (art. 7º, V).</li>
        <li>
          Agendamento da Cliente: consentimento registrado no formulário e execução de serviço
          solicitado pela titular (art. 7º, I e V).
        </li>
        <li>Cobrança: cumprimento de obrigação legal e execução do contrato.</li>
        <li>
          Registros de acesso (IP, data e hora): obrigação legal (Marco Civil da Internet) e
          segurança.
        </li>
      </ul>
      <h2>3. Compartilhamento</h2>
      <p>
        Compartilhamos dados somente com fornecedores necessários à operação: hospedagem e banco de
        dados, envio de e-mails, envio de mensagens de WhatsApp e intermediador de pagamentos. Não
        vendemos dados pessoais.
      </p>
      <h2>4. Armazenamento e segurança</h2>
      <p>
        Os dados ficam em servidores com criptografia em trânsito (HTTPS), senhas armazenadas com
        hash e acesso restrito. Cada estabelecimento só acessa os próprios dados.
      </p>
      <h2>5. Retenção</h2>
      <p>
        Mantemos os dados enquanto a conta estiver ativa. Após a exclusão da conta, os dados são
        apagados, exceto o que precisarmos guardar por obrigação legal (como registros fiscais e de
        acesso), pelo prazo exigido em lei.
      </p>
      <h2>6. Seus direitos</h2>
      <ul>
        <li>
          Confirmar a existência de tratamento, acessar, corrigir e solicitar a portabilidade dos
          dados.
        </li>
        <li>Solicitar a exclusão dos dados e revogar o consentimento.</li>
        <li>
          A Profissional exporta e exclui seus dados e os das clientes direto no painel (Minha conta
          e Clientes).
        </li>
        <li>
          A Cliente final pode pedir a exclusão diretamente ao estabelecimento ou pelo nosso canal
          de contato.
        </li>
      </ul>
      <h2>7. Cookies</h2>
      <p>
        Usamos apenas cookies essenciais para manter a sessão de login e proteger contra ataques
        (CSRF). Não usamos cookies de publicidade.
      </p>
      <h2>8. Contato do encarregado (DPO)</h2>
      <p>Dúvidas ou solicitações sobre dados pessoais: privacidade@marcai.app.</p>
    </LegalLayout>
  )
}

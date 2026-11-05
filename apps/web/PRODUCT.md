# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary users, weighted equally in decisions:

- **Autônoma solo** (manicure, cabeleireira, lash designer, barbeiro): atende sozinha, usa o painel no celular entre um atendimento e outro, com pouco tempo e as mãos ocupadas.
- **Dona de salão pequeno** (2 a 5 profissionais): gerencia a agenda da equipe, serviços, regras e relatórios, mais no computador do balcão.

Secondary audiences in the same product:

- **Profissional da equipe**: vê e opera só a própria agenda.
- **Cliente final**: agenda pela página pública (link na bio do Instagram) e usa a área da cliente para confirmar, remarcar ou cancelar, quase sempre no celular.
- **Super admin** da plataforma.

## Product Purpose

Agendamento online para salões, barbearias, estúdios e profissionais de beleza do Brasil. A profissional coloca o link na bio, a cliente escolhe serviço e horário livre sozinha, e a profissional deixa de responder mensagem para marcar. Sucesso: agenda cheia, menos faltas, nenhum horário duplicado e menos tempo no WhatsApp.

## Positioning

- **Simplicidade:** configura em minutos, sem treinamento; o link na bio resolve.
- **Preço baixo:** Essencial R$ 69/mês e Pro R$ 99/mês, com 30 dias grátis.
- **WhatsApp automático:** lembretes e confirmações saem sozinhos pelo WhatsApp (plano Pro).
- **White-label:** o mesmo código roda como produto exclusivo de um salão, com a marca e o domínio dele.

## Operating Context

- Link público `marcai.app/<slug>` divulgado na bio do Instagram, no WhatsApp e em QR Code impresso no balcão.
- Avisos para a profissional no painel (com som), push no celular, e-mail e WhatsApp (Evolution).
- Cobrança recorrente pelo Mercado Pago (cartão, PIX, boleto).
- Painel instalável como PWA; uso real dividido entre celular e computador.

## Capabilities and Constraints

- Modos: SaaS multi-tenant (padrão) e `single_tenant` / white-label.
- Agenda (dia, semana, mês), agendamentos, clientes (LGPD: consentimento e anonimização), serviços com categorias, horários e bloqueios, formulário personalizado, regras e políticas, equipe com convites, aparência (cor e logo do salão na página pública), notificações, relatórios, assinatura.
- A cor escolhida pelo salão vale só na página pública e na área da cliente; o painel usa a identidade do Marcaí.
- Modo claro e escuro no painel.
- Idioma: português do Brasil; moeda BRL; fuso horário por salão.

## Brand Commitments

- Nome: **Marcaí**. Frase de marca: "Sua agenda cheia, sem precisar responder mensagem."
- Voz: português simples e direto, falando com a profissional ("você"), sem jargão técnico.
- Visual não deve parecer "feminino demais": o público inclui barbearias e estúdios (decisão anterior do dono).
- Demonstração usa o salão fictício **Studio Vértice**.

## Evidence on Hand

- Prints do produto em `docs/prints/`.
- **Nenhum cliente pagante, depoimento ou métrica real ainda.** Não inventar depoimentos, logos de clientes, números de uso ou avaliações.

## Product Principles

1. A cliente agenda sozinha em poucos toques; cada passo extra custa um agendamento.
2. O painel precisa funcionar com uma mão, no celular, entre atendimentos.
3. Nunca deixar a profissional em dúvida se um horário está garantido.
4. Automatizar o que hoje é mensagem manual (confirmação, lembrete, remarcação).
5. Simples primeiro: recurso que exige treinamento não entra.

## Accessibility & Inclusion

Contraste AA nos modos claro e escuro; alvos de toque confortáveis no celular; status nunca indicado só por cor.

# Consentimento de Marketing do Cliente

> **MINUTA DE TEXTO E IMPLEMENTAÇÃO — NÃO VIGENTE**  
> Versão: 0.1 | Última atualização: 30 de julho de 2026

## Texto para a interface

**[ ] Quero receber comunicações promocionais do CutSync por [e-mail] [notificação push] [outro canal especificado].**

Ao marcar esta opção, você autoriza o CutSync a usar seus dados de contato e suas preferências para enviar novidades, campanhas e ofertas próprias. Este consentimento é opcional e pode ser retirado a qualquer momento em Preferências ou pelo link de descadastramento. A recusa não afeta sua conta, seus agendamentos nem comunicações essenciais.

**Link obrigatório ao lado do controle:** Política de Privacidade — versão **[VERSÃO]**.

## Regras obrigatórias de implementação

- O controle deve iniciar desmarcado e ser apresentado separadamente do aceite dos Termos.
- A finalidade e os canais devem ser específicos; não usar rótulo genérico como “aceito LGPD”.
- Registrar `marketing_consent`, canais, versão do texto, data/hora, origem e evento de revogação.
- A retirada do consentimento deve ter efeito prospectivo e ser refletida nos sistemas de envio em prazo técnico definido e auditável.
- Não utilizar dados de agendamento, frequência, perfil ou localização para segmentação promocional sem confirmação jurídica da base legal e transparência correspondente.
- Notificações de segurança e de agendamento não dependem deste controle e devem ser classificadas como essenciais.

## Texto de confirmação

**Preferência atualizada.** Você pode alterar ou retirar sua autorização de marketing a qualquer momento nas Preferências.


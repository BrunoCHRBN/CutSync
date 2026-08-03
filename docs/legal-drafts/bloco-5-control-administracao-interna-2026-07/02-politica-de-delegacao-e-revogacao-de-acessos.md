# Política de Delegação e Revogação de Acessos — Control

> **MINUTA INTERNA PARA VALIDAÇÃO — NÃO VIGENTE**  
> Versão: 0.1 | Última atualização: 30 de julho de 2026

## 1. Regra padrão

O Control inicia com um único `SaaS_Owner`. Qualquer acesso adicional depende de necessidade concreta, finalidade definida, menor privilégio e delegação explícita. Não existem convites públicos ou ampliação automática de acesso administrativo.

## 2. Solicitação e aprovação

Uma solicitação de acesso deve registrar, no mínimo: pessoa já cadastrada, papel solicitado, permissões necessárias, finalidade, prazo/revisão e aprovador. O solicitante não pode aprovar a própria elevação de privilégio.

| Decisão | Quem aprova | Controle mínimo |
|---|---|---|
| criar/alterar `SaaS_Viewer` | `SaaS_Owner` | finalidade, escopo e data de revisão |
| criar/alterar `SaaS_Editor` | `SaaS_Owner` | necessidade, escopo, treinamento e AAL2 |
| conceder/remover `SaaS_Owner` | `SaaS_Owner` autorizado, conforme procedimento de dupla validação a aprovar | AAL2, confirmação independente, auditoria reforçada e preservação do último Owner |
| acesso emergencial | `SaaS_Owner` ou procedimento de incidente aprovado | prazo curto, motivo, AAL2, registro e revisão posterior |

O último `SaaS_Owner` não pode ser removido, rebaixado ou ter o acesso revogado sem que outro Owner válido esteja ativo e a sucessão seja registrada.

## 3. Concessão técnica

1. Confirmar identidade e vínculo da pessoa.
2. Verificar que a pessoa concluiu AAL2 e aceitou o Termo de Acesso Administrativo.
3. Conceder somente o papel e capacidades aprovados por mecanismo de servidor.
4. Registrar quem concedeu, para quem, qual papel, finalidade, data/hora, revisão prevista e correlação de auditoria.
5. Notificar a pessoa sobre escopo, deveres e canal de reporte.

## 4. Revisão e revogação

Todo acesso privilegiado deve ser revisado em **[PERIODICIDADE APROVADA]** e sempre que houver mudança de função, afastamento, incidente, suspeita de abuso ou término de vínculo. A revogação deve, conforme a capacidade técnica, remover permissões, invalidar sessões e impedir nova elevação de privilégio.

Eventos de revogação devem registrar motivo codificado, ator, alvo, papel, data/hora e resultado técnico, sem expor justificativas com dados pessoais em excesso.

## 5. Exceções

Exceções não podem transformar-se em acesso permanente. Devem ter justificativa, responsável, prazo de expiração, escopo limitado e revisão posterior. A exceção não autoriza compartilhar credenciais ou ignorar AAL2, auditoria, RLS ou as demais políticas de segurança.


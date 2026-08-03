# Matriz de Acesso e Revogação — Profissionais e Colaboradores

> **DOCUMENTO OPERACIONAL PARA VALIDAÇÃO — NÃO PUBLICAR COMO TERMO DE USUÁRIO**  
> Versão: 0.1 | Última atualização: 30 de julho de 2026

## 1. Princípios obrigatórios

- acesso individual, autenticado e vinculado a convite destinado ao e-mail correto;
- menor privilégio: apenas dados e ações necessários à atribuição;
- autorização no servidor e não apenas ocultação de interface;
- revogação rápida, auditável e com efeito sobre sessão e permissões aplicáveis;
- revisão de acesso quando houver troca de função, unidade ou encerramento de vínculo;
- nenhum usuário operacional pode administrar funções globais do CutSync.

## 2. Modelo mínimo de acesso

| Perfil operacional | Acesso esperado | Não deve poder fazer sem delegação específica |
|---|---|---|
| profissional | própria agenda e dados de clientes estritamente necessários ao atendimento autorizado | administrar estabelecimento, convidar equipe, consultar dados de outras unidades, faturamento ou dados além da necessidade |
| gestor autorizado | recursos de gestão definidos pelo titular, equipe e agenda da unidade designada | transferir titularidade, acessar dados globais CutSync ou conceder poderes além de sua função |
| administrador do estabelecimento | gestão da unidade/organização conforme contrato e controles reforçados | burlar controles de segurança, acessar dados de outros estabelecimentos ou administrar Control privado |
| leitura restrita | consulta explicitamente autorizada, sem alteração | exportar, alterar agenda, criar convites ou ampliar permissões |

**Nota:** os nomes e capacidades finais devem coincidir com as regras efetivamente aplicadas no backend. Esta tabela não concede permissões por si só.

## 3. Concessão de acesso

1. Responsável autorizado seleciona estabelecimento, pessoa, função e escopo.
2. O sistema emite convite com validade limitada, vinculado ao endereço de e-mail informado.
3. A pessoa autentica-se, confere estabelecimento/função e aceita os Termos aplicáveis.
4. O servidor cria ou ativa o vínculo e registra o evento.
5. O acesso é conferido contra as permissões no primeiro uso e em ações sensíveis.

## 4. Revogação e eventos de risco

O responsável autorizado deve revogar o acesso sem atraso quando a pessoa sair da equipe, mudar de função, perder autorização ou houver suspeita de comprometimento. O sistema deve registrar responsável, motivo codificado, data/hora, escopo e resultado da revogação, evitando justificativas com dados pessoais excessivos.

Em suspeita de invasão, compartilhamento de credenciais ou perda de dispositivo, o fluxo deve permitir bloqueio imediato, encerramento de sessão, análise de registros e comunicação às partes responsáveis conforme o incidente.


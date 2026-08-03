# Política Corporativa de Segurança da Informação

> **MINUTA INTERNA PARA APROVAÇÃO — NÃO VIGENTE**  
> Versão: 0.1 | Última atualização: 30 de julho de 2026

## 1. Objetivo e aplicação

Esta Política estabelece princípios corporativos para proteger confidencialidade, integridade, disponibilidade e uso legítimo das informações do CutSync. Aplica-se a todas as pessoas autorizadas, ambientes, dispositivos, código, fornecedores e dados tratados pela empresa.

## 2. Controles mínimos

- inventário de ativos, sistemas, dados e fornecedores com dono definido;
- contas individuais, menor privilégio, revogação de acesso e autenticação reforçada para funções sensíveis;
- segredos exclusivamente em mecanismo aprovado de gestão de segredos, nunca em aplicativo cliente, código, repositório, ticket ou log;
- revisão de código, dependências, configurações de ambiente, RLS/permissões e exposição de APIs antes de mudanças relevantes;
- separação entre produção e desenvolvimento/teste, com proibição de copiar dados de produção sem autorização e proteção adequadas;
- backups, recuperação e restauração testada conforme criticidade do serviço;
- monitoramento e registros técnicos minimizados, com acesso controlado e retenção definida;
- gestão de vulnerabilidades, atualizações, incidentes e fornecedores conforme risco.

## 3. Dados e desenvolvimento seguro

Toda funcionalidade nova deve ser desenhada com minimização de dados, controle de acesso no servidor, validação de entrada, tratamento seguro de erros, logs sem dados pessoais excessivos e verificação de dependências. Variáveis públicas de aplicativo não podem conter segredos; chaves administrativas, tokens de integração e assinaturas de webhook permanecem apenas em ambiente seguro de servidor.

## 4. Responsabilidades

Cada pessoa autorizada deve proteger credenciais e dispositivos, seguir procedimentos, reportar falhas e não burlar controles. Donos de sistema devem manter inventário, revisão de acesso e planos de recuperação. A liderança aprova risco residual e recursos necessários; segurança e privacidade orientam, verificam e escalam desvios.

## 5. Exceções e revisão

Exceções devem ser documentadas com escopo, risco, compensação, responsável e data de expiração. Esta Política deve ser revisada em **[PERIODICIDADE]** ou diante de incidente, mudança tecnológica/material, exigência legal ou alteração relevante de produto.


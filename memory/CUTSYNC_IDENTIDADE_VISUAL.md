# CutSync — Plano de Identidade Visual e Sistema de Cores

## 1. Objetivo do documento

Este documento registra a direção visual recomendada para a CutSync, com foco em:

- manter o sistema predominantemente claro;
- construir uma identidade própria e reconhecível;
- permitir que cada estabelecimento utilize sua cor personalizada;
- preservar consistência, legibilidade e acessibilidade;
- atender clientes, profissionais e donos de estabelecimentos sem favorecer visualmente apenas um desses públicos;
- servir como base para futuras decisões de design e implementação.

Este é um planejamento conceitual. Nenhuma linha de código funcional foi alterada nesta etapa.

---

## 2. Decisão principal

### Direção recomendada

Adotar um **verde profundo, levemente acinzentado**, como cor institucional principal da CutSync, combinado com:

- fundos claros e quentes;
- superfícies brancas;
- creme como apoio editorial;
- textos em verde quase preto;
- dourado terroso opcional para detalhes especiais.

O verde presente na referência enviada é uma boa base porque transmite sofisticação, segurança e cuidado sem limitar a marca a um único segmento, como barbearias, salões femininos, clínicas de estética ou profissionais independentes.

### Papel do verde

O verde não deve preencher toda a interface. Sua função principal será:

- identificar a marca CutSync;
- indicar ações principais;
- destacar navegação ativa;
- reforçar hierarquia visual;
- criar contraste em áreas institucionais;
- conectar visualmente as diferentes experiências do sistema.

Para manter o tom claro, a maior parte das telas deverá utilizar fundos claros, reservando o verde profundo para pontos de atenção e áreas especiais.

---

## 3. Psicologia das cores aplicada à CutSync

A psicologia das cores deve orientar, mas não determinar sozinha, a identidade. Contexto, contraste, repetição e consistência influenciam mais a percepção final do que o significado isolado de uma cor.

### Verde profundo

Percepções favoráveis:

- confiança;
- equilíbrio;
- crescimento;
- organização;
- cuidado;
- estabilidade;
- bem-estar.

Aplicação na CutSync:

- para clientes, transmite tranquilidade no processo de escolha e agendamento;
- para profissionais, comunica estabilidade e organização da rotina;
- para donos, associa a plataforma a controle e crescimento do negócio.

### Creme e marfim

Percepções favoráveis:

- acolhimento;
- proximidade;
- conforto;
- cuidado artesanal;
- sofisticação discreta.

Aplicação na CutSync:

- suaviza o aspecto tecnológico da plataforma;
- aproxima a marca do universo de beleza e serviços pessoais;
- cria uma alternativa mais premium ao branco puro.

### Branco

Percepções favoráveis:

- clareza;
- limpeza;
- simplicidade;
- eficiência.

Aplicação na CutSync:

- superfícies de cards;
- formulários;
- agendas;
- tabelas;
- áreas com alta densidade de informações.

### Dourado terroso opcional

Percepções favoráveis:

- qualidade;
- valor;
- experiência premium.

Aplicação na CutSync:

- detalhes editoriais;
- selos especiais;
- plano recomendado;
- destaques institucionais.

O dourado não deve competir com o verde nem ser usado como cor principal de botões cotidianos.

---

## 4. Paleta institucional proposta

Os valores abaixo formam uma proposta inicial. Antes da implementação definitiva, devem ser visualmente testados em telas reais e validados por contraste.

### Cores principais

| Token conceitual | Cor sugerida | Uso recomendado |
|---|---:|---|
| Verde institucional | `#244332` | Botões principais, marca, navegação ativa e destaques |
| Verde interativo | `#315A45` | Hover, elementos interativos e variações de destaque |
| Verde profundo | `#172E23` | Textos especiais, rodapé e áreas institucionais escuras |
| Verde suave | `#E7EFE9` | Fundos selecionados, chips e estados informativos da marca |
| Verde muito suave | `#F1F6F2` | Seções alternadas e fundos contextuais |

### Cores neutras

| Token conceitual | Cor sugerida | Uso recomendado |
|---|---:|---|
| Fundo geral quente | `#F7F5EE` | Fundo principal do sistema e da landing page |
| Superfície principal | `#FFFFFF` | Cards, modais, tabelas e formulários |
| Superfície secundária | `#FCFBF7` | Blocos secundários e áreas de leitura |
| Creme institucional | `#E8DFC2` | Identidade, ilustrações e detalhes editoriais |
| Texto principal | `#18221C` | Títulos, dados e textos de alta prioridade |
| Texto secundário | `#667069` | Descrições, metadados e textos auxiliares |
| Texto discreto | `#89918C` | Placeholders e informações de baixa prioridade |
| Borda padrão | `#DCE3DE` | Divisores, campos e contornos suaves |

### Destaque complementar opcional

| Token conceitual | Cor sugerida | Uso recomendado |
|---|---:|---|
| Dourado terroso | `#B9955A` | Destaques premium e detalhes especiais |
| Dourado suave | `#F0E5D1` | Fundo de selos e blocos premium |

---

## 5. Proporção de uso

Como ponto de partida, utilizar a seguinte distribuição visual:

- **70% — neutros claros:** fundos, superfícies, áreas de leitura e organização;
- **20% — identidade CutSync:** verde institucional e suas variações;
- **10% — personalização:** cor do estabelecimento ou destaque complementar.

Essa proporção não precisa ser matematicamente rígida. Seu objetivo é impedir que a personalização de um estabelecimento descaracterize a plataforma ou prejudique a leitura.

---

## 6. Separação entre marca da plataforma e marca do estabelecimento

A CutSync precisa funcionar como uma plataforma com identidade própria e, ao mesmo tempo, permitir que cada estabelecimento se reconheça dentro dela.

### Camada 1 — Identidade permanente da CutSync

Deve permanecer consistente em todo o sistema:

- autenticação;
- navegação global;
- configurações da conta;
- estrutura dos dashboards;
- tipografia base;
- fundos e superfícies;
- mensagens de sistema;
- estados de erro, alerta e sucesso;
- componentes administrativos;
- linguagem visual de modais e formulários.

Essa camada utiliza principalmente os neutros claros e o verde institucional.

### Camada 2 — Identidade do estabelecimento

A cor escolhida pelo estabelecimento pode aparecer em:

- perfil público;
- capa e elementos editoriais do estabelecimento;
- botão principal de agendamento dentro do perfil público;
- serviço, profissional, data ou horário selecionado;
- indicador das etapas do agendamento;
- chips e pequenos destaques;
- detalhes gráficos e bordas de ênfase;
- cartões de apresentação compartilháveis.

### Elementos que não devem ser controlados pelo estabelecimento

A cor personalizada não deve substituir:

- vermelho de erro ou ação destrutiva;
- amarelo ou âmbar de alerta;
- verde semântico de sucesso;
- textos principais;
- cores essenciais de acessibilidade;
- estrutura global de navegação;
- fundos principais do sistema;
- estados desabilitados;
- indicadores críticos de status.

Isso evita que uma cor de marca seja confundida com sucesso, erro, cancelamento ou indisponibilidade.

---

## 7. Regras para personalização segura

### 7.1 Contraste automático

O sistema deverá determinar se o texto sobre a cor personalizada será claro ou escuro.

Exemplos:

- fundo amarelo-claro deve receber texto escuro;
- fundo azul-marinho pode receber texto branco;
- fundo cinza médio pode exigir ajuste antes de ser utilizado.

### 7.2 Limites de luminosidade e saturação

Cores muito claras podem desaparecer sobre o fundo. Cores extremamente saturadas podem transmitir uma aparência pouco sofisticada e cansar visualmente.

Recomenda-se:

- gerar automaticamente uma variação mais escura para texto, borda ou botão;
- gerar uma variação muito clara para fundos selecionados;
- limitar cores neon em grandes superfícies;
- impedir combinações sem contraste suficiente.

### 7.3 Paleta derivada

A partir da cor principal escolhida pelo estabelecimento, o sistema poderá gerar:

- cor principal;
- cor de interação ou hover;
- fundo suave;
- borda suave;
- texto compatível;
- estado selecionado.

O estabelecimento escolhe uma cor, mas a plataforma controla como ela é transformada em uma paleta utilizável.

### 7.4 Alternativa segura

Se a cor escolhida não puder atender aos critérios de contraste, o sistema deverá:

1. corrigir automaticamente a tonalidade;
2. apresentar uma prévia da correção;
3. utilizar o verde institucional como fallback em ações críticas.

---

## 8. Aplicação por contexto

### Landing page institucional

- fundo geral em marfim ou branco quente;
- títulos em verde profundo;
- botão principal em verde institucional;
- creme em detalhes editoriais;
- seções escuras pontuais para criar ritmo e reforçar a marca;
- estabelecimentos reais podem exibir suas cores nos próprios cards e demonstrações.

O verde escuro da referência funciona especialmente bem em:

- hero parcial;
- bloco de posicionamento da marca;
- rodapé;
- seção de demonstração premium;
- transições entre a jornada do cliente e a jornada do dono.

### Experiência do cliente

- priorizar fundos claros e conteúdo visual do estabelecimento;
- utilizar a cor do estabelecimento em seleções e CTA de agendamento;
- manter estrutura, textos e estados do sistema consistentes com a CutSync;
- preservar o contexto visual escolhido ao solicitar login.

### Dashboard do dono

- usar verde institucional em navegação, ações principais e indicadores selecionados;
- manter gráficos predominantemente neutros, adicionando cores somente quando houver significado;
- usar cores semânticas fixas para crescimento, queda, alerta e erro;
- evitar grandes fundos personalizados que dificultem a leitura de dados.

### Dashboard do profissional

- manter a mesma base do dashboard do dono;
- permitir pequenos detalhes com a cor do estabelecimento;
- usar destaque claro para o próximo atendimento e o horário atual;
- preservar leitura rápida da agenda.

### Precificação

- fundo claro e comparável;
- verde institucional no CTA principal;
- creme ou dourado suave no plano recomendado;
- evitar usar a cor de um estabelecimento específico nessa seção, pois a oferta é da CutSync.

---

## 9. Componentes e hierarquia de cor

### Botões

**Primário**

- fundo verde institucional;
- texto branco ou marfim com contraste aprovado;
- hover em verde interativo;
- foco visível independente do hover.

**Secundário**

- fundo branco;
- texto verde institucional;
- borda verde suave ou institucional;
- hover com fundo verde muito suave.

**Contextual do estabelecimento**

- permitido em perfil público e fluxo de agendamento;
- deve utilizar contraste automático;
- não deve substituir botões destrutivos ou mensagens semânticas.

### Campos de formulário

- superfície branca;
- borda neutra;
- foco em verde institucional nas áreas globais;
- foco com a cor derivada do estabelecimento apenas em experiências públicas personalizadas;
- mensagens de erro sempre semânticas e independentes da marca.

### Cards

- fundo branco ou superfície secundária;
- borda discreta;
- sombras suaves e pouco coloridas;
- cor de personalização limitada a borda, marcador, ícone ou pequeno cabeçalho.

### Navegação

- navegação global em verde institucional;
- estado ativo com contraste forte;
- cor do estabelecimento restrita ao conteúdo contextual;
- não alternar toda a navegação para cada estabelecimento.

### Gráficos

- verde CutSync para série principal;
- tons neutros para comparação;
- cor do estabelecimento apenas quando representar aquele negócio;
- paleta acessível para múltiplas séries;
- informações nunca devem depender somente da cor: usar rótulos, formas ou padrões.

---

## 10. Cores semânticas

As cores semânticas devem ser fixas em toda a plataforma.

| Significado | Direção sugerida | Observação |
|---|---|---|
| Sucesso | Verde semântico mais vivo que a marca | Não confundir com todo elemento institucional |
| Alerta | Âmbar | Deve incluir ícone ou texto explicativo |
| Erro | Vermelho | Reservado para falhas e ações destrutivas |
| Informação | Azul ou azul-petróleo | Utilizado com moderação |
| Neutro | Cinza-esverdeado | Status sem urgência |

Nenhuma informação crítica deve ser comunicada apenas pela cor.

---

## 11. Acessibilidade

### Contraste

Todo texto e componente interativo deverá atender ao menos às exigências aplicáveis do WCAG 2.2 AA.

Devem ser validados:

- texto normal sobre fundos claros e escuros;
- textos de botões;
- bordas e estados de campos;
- foco de teclado;
- cores personalizadas dos estabelecimentos;
- gráficos e indicadores.

### Estados de interação

Hover, foco, selecionado e desabilitado não devem ser diferenciados apenas por mudanças mínimas de tonalidade.

Também podem utilizar:

- borda;
- sublinhado;
- ícone;
- espessura;
- mudança de superfície;
- texto auxiliar.

### Testes necessários

- baixa visão;
- daltonismo;
- brilho reduzido e elevado;
- telas de baixa qualidade;
- uso externo em dispositivos móveis;
- contraste da cor personalizada de cada estabelecimento.

---

## 12. Tema claro e uso de áreas escuras

A direção principal deve continuar clara. Isso favorece:

- leitura de agendas;
- formulários;
- tabelas;
- dashboards;
- percepção de limpeza;
- adaptação às cores dos estabelecimentos.

O verde profundo pode ser utilizado em áreas escuras pontuais para criar contraste emocional, mas não deve dominar todas as telas.

### Distribuição recomendada

- sistema operacional: majoritariamente claro;
- landing page: clara, com blocos escuros estratégicos;
- perfil público: claro, adaptado à identidade do estabelecimento;
- modais: superfícies claras sobre fundo escurecido;
- rodapé e áreas institucionais: verde profundo.

---

## 13. Direção tipográfica associada

A referência enviada combina verde profundo, creme e uma tipografia serifada editorial. Essa direção pode funcionar para a marca e para a landing page, mas interfaces operacionais precisam priorizar leitura.

Recomendação:

- tipografia serifada ou de caráter editorial para logotipo, grandes títulos e campanhas;
- tipografia sem serifa altamente legível para agenda, formulários, dashboards e textos longos;
- não utilizar a tipografia do logotipo em tabelas, botões pequenos ou dados operacionais;
- manter hierarquia consistente entre marca, marketing e produto.

---

## 14. O que evitar

- usar o verde escuro como fundo de todas as telas;
- permitir que cada estabelecimento altere toda a interface;
- utilizar branco puro em excesso sem superfícies ou hierarquia;
- misturar verde institucional com muitos tons concorrentes;
- usar dourado em todos os botões;
- aceitar cores personalizadas sem análise de contraste;
- transformar cores de marca em cores de erro ou sucesso;
- depender apenas de cor para comunicar status;
- utilizar tons neon em grandes áreas;
- mudar a navegação global conforme o estabelecimento acessado.

---

## 15. Critérios para validação futura

Antes da implementação, revisar as seguintes perguntas:

1. O verde proposto continua reconhecível em telas claras?
2. O sistema permanece visualmente CutSync mesmo quando um estabelecimento usa outra cor?
3. A cor personalizada melhora a identidade sem prejudicar a navegação?
4. Os botões principais são facilmente identificáveis?
5. Agenda, formulários e dashboards continuam leves e legíveis?
6. Os contrastes atendem ao WCAG 2.2 AA?
7. A identidade funciona para barbearias, salões, estética e profissionais independentes?
8. A landing page consegue apresentar vários estabelecimentos sem parecer visualmente fragmentada?
9. Estados semânticos permanecem claros em todas as personalizações?
10. A marca transmite cuidado e crescimento sem parecer uma plataforma médica ou ambiental?

---

## 16. Testes de design recomendados

### Cenários visuais

Criar futuras simulações utilizando estabelecimentos com:

- vermelho;
- amarelo-claro;
- rosa;
- azul-marinho;
- preto;
- verde próximo ao institucional;
- cor extremamente saturada.

### Telas prioritárias

- landing page;
- formulário de segmentação;
- card de estabelecimento;
- perfil público;
- seleção de serviço;
- seleção de profissional;
- calendário e horários;
- bloqueio de login antes da confirmação;
- dashboard do dono;
- dashboard do profissional;
- tela de planos.

### Dispositivos

- celular pequeno;
- celular grande;
- tablet;
- notebook;
- monitor amplo.

---

## 17. Decisões em aberto

- confirmar a tonalidade final do verde por meio de testes em telas reais;
- escolher a tipografia institucional definitiva;
- decidir se haverá modo escuro completo no futuro;
- definir a quantidade de personalização permitida por plano;
- definir se o estabelecimento poderá escolher somente cores aprovadas ou inserir qualquer cor;
- validar o uso do dourado terroso como apoio;
- determinar a paleta semântica final;
- validar contrastes e estados interativos antes da implementação.

---

## 18. Recomendação final

A CutSync deve adotar uma identidade **clara, acolhedora e operacional**, apoiada por um verde profundo como assinatura institucional.

A combinação recomendada é:

> **Verde profundo + creme + branco quente + neutros esverdeados**

A cor de cada estabelecimento deve enriquecer a experiência pública e o fluxo de agendamento, sem substituir a estrutura visual da plataforma. Dessa forma, a CutSync mantém reconhecimento próprio enquanto oferece personalização real aos negócios.

---

## 19. Histórico do documento

- **Versão 1:** definição da direção verde, paleta inicial, arquitetura de personalização, acessibilidade e critérios de revisão.
- **Status:** planejamento registrado; implementação ainda não iniciada.
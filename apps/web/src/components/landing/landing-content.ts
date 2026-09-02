// Conteúdo das landings. Cada item descreve uma capacidade prevista no escopo
// de MVP do contrato de produto (seção 10) e confirmada no código — nada aqui
// é promessa de entrega futura nem métrica de desempenho.

export type LandingPageAudience = 'client' | 'business';

export type LandingSectionId =
  | 'hero'
  | 'search'
  | 'proposal_values'
  | 'comparison'
  | 'ecosystem'
  | 'roles'
  | 'services'
  | 'devices'
  | 'transparency'
  | 'security'
  | 'how_to_start'
  | 'resources'
  | 'testimonials'
  | 'faq'
  | 'contact'
  | 'future';

/** Catálogo de todas as seções existentes. A ordem real de cada página vive em LANDING_JOURNEY. */
export const LANDING_SECTION_ORDER: readonly LandingSectionId[] = [
  'hero',
  'search',
  'proposal_values',
  'comparison',
  'ecosystem',
  'roles',
  'services',
  'devices',
  'transparency',
  'security',
  'how_to_start',
  'resources',
  'testimonials',
  'faq',
  'contact',
  'future',
] as const;

/**
 * Cada produto tem a própria sequência editorial, conforme a seção 7 do contrato de produto:
 * páginas completas e estruturas responsivas não são compartilhadas entre superfícies.
 *
 * O cliente chega para encontrar um horário, então a página abre na busca e explica o fluxo logo
 * em seguida. O estabelecimento chega para avaliar, então a página abre pelo problema que resolve
 * e só pede a decisão depois da demonstração.
 */
export const LANDING_JOURNEY: Record<LandingPageAudience, readonly LandingSectionId[]> = {
  client: [
    'hero',
    'search',
    'how_to_start',
    'services',
    'ecosystem',
    'devices',
    'proposal_values',
    'transparency',
    'security',
    'resources',
    'testimonials',
    'faq',
    'contact',
    'future',
  ],
  business: [
    'hero',
    'proposal_values',
    'comparison',
    'ecosystem',
    'roles',
    'services',
    'devices',
    'transparency',
    'security',
    'how_to_start',
    'resources',
    'testimonials',
    'faq',
    'contact',
    'future',
  ],
};

export interface LandingNavItem {
  id: Extract<LandingSectionId, 'search' | 'proposal_values' | 'services' | 'security' | 'how_to_start' | 'resources' | 'contact'>;
  label: string;
}

export const LANDING_NAV_ITEMS: Record<LandingPageAudience, readonly LandingNavItem[]> = {
  client: [
    { id: 'search', label: 'Explorar' },
    { id: 'how_to_start', label: 'Como funciona' },
    { id: 'security', label: 'Confiança' },
    { id: 'resources', label: 'Recursos' },
    { id: 'contact', label: 'Contato' },
  ],
  business: [
    { id: 'proposal_values', label: 'Solução' },
    { id: 'services', label: 'Demonstração' },
    { id: 'security', label: 'Confiança' },
    { id: 'resources', label: 'Recursos' },
    { id: 'contact', label: 'Contato' },
  ],
};

interface SectionCopy {
  eyebrow: string;
  title: string;
  description: string;
}

interface LandingItem {
  title: string;
  description: string;
}

export interface LandingEcosystemStep {
  role: 'Cliente' | 'Estabelecimento' | 'Profissional';
  title: string;
  description: string;
}

export interface LandingResourceCard {
  id: string;
  title: string;
  description: string;
  action: string;
  target: 'section' | 'route';
  reference: string;
}

export interface LandingFaqEntry {
  question: string;
  answer: string;
}

export interface LandingAudienceContent {
  proposal: SectionCopy & { statement: string; values: readonly LandingItem[] };
  ecosystem: SectionCopy & { steps: readonly LandingEcosystemStep[]; note: string };
  services: SectionCopy & { items: readonly LandingItem[]; note: string };
  devices: SectionCopy & { note: string };
  transparency: SectionCopy;
  security: SectionCopy & { items: readonly LandingItem[] };
  howToStart: SectionCopy & { steps: readonly LandingItem[] };
  resources: SectionCopy & { cards: readonly LandingResourceCard[] };
  faq: SectionCopy & { entries: readonly LandingFaqEntry[] };
  contact: SectionCopy & { consentLabel: string; submitLabel: string };
  future: { eyebrow: string; title: string; paragraphs: readonly string[] };
  scene: { source: 'client' | 'business'; caption: string; alternativeText: string };
}

/**
 * Os quatro princípios da marca são os mesmos nas duas páginas, mas cada audiência lê o que o
 * princípio significa para ela. O cliente não precisa ler sobre configuração de unidade.
 */
const CLIENT_VALUES: readonly LandingItem[] = [
  { title: 'Clareza', description: 'Serviço, duração e valor aparecem como o estabelecimento publicou, antes de você decidir.' },
  { title: 'Autonomia', description: 'Você pesquisa, compara e escolhe o horário sem depender de resposta por mensagem.' },
  { title: 'Confiança', description: 'Seus dados de contato ficam com o estabelecimento do atendimento, e com mais ninguém.' },
  { title: 'Cuidado', description: 'Linguagem direta, nenhum dado pedido sem finalidade e nenhuma etapa além da necessária.' },
];

const BUSINESS_VALUES: readonly LandingItem[] = [
  { title: 'Clareza', description: 'A vitrine pública mostra exatamente o que está configurado na operação, sem versão paralela.' },
  { title: 'Autonomia', description: 'Você define serviços, jornadas e regras da unidade, e o produto segue essa configuração.' },
  { title: 'Confiança', description: 'Acesso por perfil, registro das operações e dados do cliente restritos ao atendimento.' },
  { title: 'Cuidado', description: 'O produto acompanha o ritmo de quem atende, sem exigir treinamento longo para começar.' },
];

const CLIENT_ECOSYSTEM: readonly LandingEcosystemStep[] = [
  { role: 'Cliente', title: 'Descobre e agenda', description: 'Busca por serviço ou localização, abre o perfil da unidade e escolhe um horário na agenda publicada.' },
  { role: 'Estabelecimento', title: 'Administra a operação', description: 'Recebe a solicitação na mesma agenda em que organiza serviços, equipe, escalas e vitrine.' },
  { role: 'Profissional', title: 'Acompanha sua rotina', description: 'Vê os atendimentos do dia e conclui o que já foi realizado, sem acesso ao restante da unidade.' },
];

const BUSINESS_ECOSYSTEM: readonly LandingEcosystemStep[] = [
  { role: 'Estabelecimento', title: 'Administra a operação', description: 'Publica serviços com duração e valor, define jornadas e mantém a agenda da unidade sob controle.' },
  { role: 'Profissional', title: 'Acompanha sua rotina', description: 'Recebe a agenda do dia, confirma presença e conclui atendimentos dentro do próprio perfil.' },
  { role: 'Cliente', title: 'Descobre e agenda', description: 'Encontra a vitrine publicada e escolhe um horário disponível sem depender de mensagens.' },
];

const SHARED_RESOURCES = (audience: LandingPageAudience): readonly LandingResourceCard[] => [
  {
    id: 'how-it-works',
    title: 'Como funciona',
    description: audience === 'client'
      ? 'A sequência entre descoberta, escolha e confirmação do agendamento.'
      : 'A sequência entre vitrine publicada, agenda da unidade e rotina do profissional.',
    action: 'Ver na página',
    target: 'section',
    reference: 'ecosystem',
  },
  {
    id: 'setup',
    title: audience === 'client' ? 'Preparar sua conta' : 'Configuração inicial',
    description: audience === 'client'
      ? 'O que é pedido no acesso e por que a conta é necessária apenas na confirmação.'
      : 'A ordem sugerida entre serviços, vitrine, agenda e equipe.',
    action: 'Ver na página',
    target: 'section',
    reference: 'how_to_start',
  },
  {
    id: 'faq',
    title: 'Perguntas frequentes',
    description: 'Dúvidas comuns sobre uso, dados e limites do produto hoje.',
    action: 'Ver na página',
    target: 'section',
    reference: 'faq',
  },
  {
    id: 'privacy',
    title: 'Privacidade',
    description: 'Como tratamos dados de cadastro, agendamentos e solicitações comerciais.',
    action: 'Abrir documento',
    target: 'route',
    reference: '/privacy',
  },
  {
    id: 'contact',
    title: 'Ajuda e confiança',
    description: 'Fale com a equipe do CutSync e acesse os documentos públicos disponíveis.',
    action: 'Ir para contato',
    target: 'section',
    reference: 'contact',
  },
];

export const LANDING_CONTENT: Record<LandingPageAudience, LandingAudienceContent> = {
  client: {
    proposal: {
      eyebrow: 'PROPOSTA E VALORES',
      title: 'Agendar deveria ser uma decisão simples.',
      statement: 'O CutSync existe para que você veja serviços, valores informados pelo estabelecimento e horários antes de escolher — e confirme sem negociar por mensagem.',
      description: 'Quatro princípios orientam cada tela que você usa.',
      values: CLIENT_VALUES,
    },
    ecosystem: {
      eyebrow: 'ECOSSISTEMA CONECTADO',
      title: 'Você escolhe; o estabelecimento e o profissional acompanham.',
      description: 'O caminho começa na sua busca e termina em uma rotina organizada para quem atende.',
      steps: CLIENT_ECOSYSTEM,
      note: 'Cada perfil vê apenas as informações necessárias para a própria etapa.',
    },
    services: {
      eyebrow: 'SERVIÇOS E CAPACIDADES',
      title: 'O que já está disponível para você.',
      description: 'Recursos que existem hoje na experiência do cliente.',
      items: [
        { title: 'Explorar sem cadastro', description: 'Busca pública por serviço, estabelecimento, bairro ou cidade.' },
        { title: 'Perfil do estabelecimento', description: 'Catálogo publicado com duração e valor informados por cada unidade.' },
        { title: 'Perfil do profissional', description: 'Veja quem atende na unidade e quais serviços cada profissional realiza.' },
        { title: 'Agendar', description: 'Escolha de serviço e horário, com a disponibilidade consultada na agenda da unidade.' },
        { title: 'Próximos e histórico', description: 'Acompanhe o que está confirmado e o que já foi atendido.' },
        { title: 'Remarcar e cancelar', description: 'Ajuste o compromisso conforme as regras publicadas pela unidade.' },
        { title: 'Avaliar o atendimento', description: 'Registre sua avaliação depois que o atendimento é concluído.' },
        { title: 'Preferências e notificações', description: 'Você define quais comunicações deseja receber.' },
      ],
      note: 'Itens em desenvolvimento aparecem apenas na seção de transparência, nunca como disponíveis.',
    },
    devices: {
      eyebrow: 'PRODUTO EM DIFERENTES DISPOSITIVOS',
      title: 'A mesma clareza no celular, no tablet e no computador.',
      description: 'O CutSync é acessado pelo navegador e adapta o layout ao espaço disponível.',
      note: 'Prévias ilustrativas do produto. Não representam publicação em lojas de aplicativos.',
    },
    transparency: {
      eyebrow: 'PRODUTO REAL E TRANSPARÊNCIA',
      title: 'O que existe hoje e o que ainda está em validação.',
      description: 'Mantemos essa separação pública para você decidir com informação verificável.',
    },
    security: {
      eyebrow: 'SEGURANÇA E PRIVACIDADE',
      title: 'Seus dados servem ao atendimento, e nada além disso.',
      description: 'Acesso por perfil, dados de contato protegidos e documentos públicos sempre disponíveis.',
      items: [
        { title: 'Acesso por perfil', description: 'Cliente, estabelecimento e profissional enxergam contextos distintos.' },
        { title: 'Dados de contato protegidos', description: 'Compartilhados apenas com o estabelecimento do atendimento.' },
        { title: 'Autenticação da conta', description: 'Entrada por e-mail e senha, com recuperação e verificação de identidade.' },
        { title: 'Documentos públicos', description: 'Política de privacidade e exclusão de conta acessíveis a qualquer momento.' },
      ],
    },
    howToStart: {
      eyebrow: 'COMO FUNCIONA',
      title: 'Três passos até o horário confirmado.',
      description: 'Você pode explorar antes de entrar. A conta é necessária somente para concluir a reserva.',
      steps: [
        { title: 'Descubra', description: 'Busque por serviço, estabelecimento, bairro ou cidade na vitrine pública.' },
        { title: 'Escolha', description: 'Abra o perfil, compare o catálogo publicado e veja os horários da agenda.' },
        { title: 'Confirme', description: 'Acesse sua conta apenas na última etapa para finalizar o agendamento.' },
      ],
    },
    resources: {
      eyebrow: 'RECURSOS ÚTEIS',
      title: 'Orientações reunidas em um só lugar.',
      description: 'Atalhos para as seções desta página e para os documentos públicos do CutSync.',
      cards: SHARED_RESOURCES('client'),
    },
    faq: {
      eyebrow: 'PERGUNTAS FREQUENTES',
      title: 'O essencial, sem letras pequenas.',
      description: 'Informações diretas para navegar com confiança.',
      entries: [
        { question: 'Preciso criar conta para pesquisar?', answer: 'Não. Você explora estabelecimentos e serviços sem cadastro; a conta entra apenas na confirmação.' },
        { question: 'Os horários mostrados são reais?', answer: 'A disponibilidade é consultada na agenda do estabelecimento antes da confirmação do agendamento.' },
        { question: 'Quem define os valores dos serviços?', answer: 'Cada estabelecimento informa duração e valor dos próprios serviços; o CutSync apenas apresenta o que foi publicado.' },
        { question: 'Posso remarcar ou cancelar?', answer: 'Sim, pela sua lista de compromissos, respeitando as regras que a unidade publicou.' },
        { question: 'O CutSync faz a cobrança do atendimento?', answer: 'Nesta fase o CutSync organiza o agendamento. O acerto do atendimento segue as regras de cada estabelecimento.' },
        { question: 'Como posso excluir minha conta?', answer: 'Pela página pública de exclusão de conta, com o mesmo e-mail usado no acesso.' },
      ],
    },
    contact: {
      eyebrow: 'CONTATO',
      title: 'Precisa de ajuda para agendar?',
      description: 'Envie sua dúvida e a equipe do CutSync responde pelo e-mail informado.',
      consentLabel: 'Autorizo o CutSync a usar meu nome e e-mail para responder a esta solicitação.',
      submitLabel: 'Enviar dúvida',
    },
    future: {
      eyebrow: 'VISÃO DE FUTURO',
      title: 'Um agendamento que respeita o tempo de todos.',
      paragraphs: [
        'Acreditamos que escolher um horário não deveria exigir insistência, nem deixar quem atende preso ao celular.',
        'Seguimos construindo o CutSync em etapas verificáveis: o que entra na página só aparece quando existe no produto.',
      ],
    },
    scene: {
      source: 'client',
      caption: 'Cena ilustrativa',
      alternativeText: 'Cena ilustrativa de uma cliente escolhendo um horário pelo celular em um ambiente de autocuidado.',
    },
  },
  business: {
    proposal: {
      eyebrow: 'PROPOSTA E VALORES',
      title: 'Sua vitrine e sua agenda no mesmo fluxo.',
      statement: 'O CutSync existe para que a apresentação pública do estabelecimento alimente a rotina real da equipe, sem planilhas paralelas e sem retrabalho.',
      description: 'Quatro princípios orientam cada decisão do produto.',
      values: BUSINESS_VALUES,
    },
    ecosystem: {
      eyebrow: 'ECOSSISTEMA CONECTADO',
      title: 'Você administra; o profissional executa; o cliente agenda.',
      description: 'Um único fluxo conecta os três papéis, começando pela operação do estabelecimento.',
      steps: BUSINESS_ECOSYSTEM,
      note: 'O profissional acompanha apenas a própria agenda; a visão da unidade permanece com a administração.',
    },
    services: {
      eyebrow: 'SERVIÇOS E CAPACIDADES',
      title: 'O que já está disponível para o seu negócio.',
      description: 'Recursos que existem hoje na experiência de estabelecimento e profissional.',
      items: [
        { title: 'Vitrine pública', description: 'Perfil, endereço e serviços ativos publicados para descoberta.' },
        { title: 'Meu dia e agenda da unidade', description: 'Criação, confirmação, remarcação e conclusão de atendimentos.' },
        { title: 'Encaixe e status do atendimento', description: 'Registre o encaixe e acompanhe a situação de cada atendimento do dia.' },
        { title: 'Bloqueios de agenda', description: 'Reserve horários sem atendimento para pausas e compromissos internos da unidade.' },
        { title: 'Catálogo de serviços', description: 'Nome, duração, valor, ordenação e desativação consciente.' },
        { title: 'Equipe, convites e escalas', description: 'Convites por perfil, horários de trabalho e responsabilidades de cada profissional.' },
        { title: 'Perfil profissional', description: 'Cada profissional acompanha a própria agenda, sem ver o restante da unidade.' },
        { title: 'Resumo de desempenho', description: 'Acompanhamento dos atendimentos realizados para apoiar a gestão da unidade.' },
        { title: 'Notificações operacionais', description: 'Avisos da operação para a equipe acompanhar a agenda do dia.' },
        { title: 'Configurações essenciais', description: 'Publicação da vitrine, dados da unidade e parâmetros de atendimento.' },
      ],
      note: 'A demonstração abaixo usa exemplos fictícios e representa somente funcionalidades disponíveis.',
    },
    devices: {
      eyebrow: 'PRODUTO EM DIFERENTES DISPOSITIVOS',
      title: 'Do balcão ao computador da administração.',
      description: 'A equipe usa o CutSync pelo navegador, com layout adaptado ao dispositivo em uso.',
      note: 'Prévias ilustrativas do produto. Não representam publicação em lojas de aplicativos.',
    },
    transparency: {
      eyebrow: 'PRODUTO REAL E TRANSPARÊNCIA',
      title: 'O que já opera e o que está em validação.',
      description: 'Publicamos essa separação para que sua avaliação use apenas o que existe hoje.',
    },
    security: {
      eyebrow: 'SEGURANÇA E PRIVACIDADE',
      title: 'Cada perfil enxerga apenas o que precisa.',
      description: 'Controle de acesso, proteção dos dados de contato e documentos públicos disponíveis.',
      items: [
        { title: 'Acesso por perfil', description: 'Administração, profissional e cliente operam com permissões separadas.' },
        { title: 'Dados de contato protegidos', description: 'Informações do cliente ficam restritas ao atendimento correspondente.' },
        { title: 'Autenticação e convites', description: 'Entrada por e-mail e senha, com convites controlados para a equipe.' },
        { title: 'Documentos públicos', description: 'Política de privacidade e exclusão de conta sempre acessíveis.' },
      ],
    },
    howToStart: {
      eyebrow: 'COMO COMEÇAR',
      title: 'Três passos para avaliar com a equipe.',
      description: 'Uma conversa curta é suficiente para entender se o CutSync atende sua operação.',
      steps: [
        { title: 'Fale com a equipe', description: 'Envie o formulário de contato comercial com o cenário do seu estabelecimento.' },
        { title: 'Veja o produto', description: 'Explore a demonstração das capacidades disponíveis hoje.' },
        { title: 'Configure a unidade', description: 'Cadastre serviços, vitrine, agenda e equipe — ou crie seu acesso por conta própria.' },
      ],
    },
    resources: {
      eyebrow: 'RECURSOS ÚTEIS',
      title: 'Material de apoio para decidir.',
      description: 'Atalhos para as seções desta página e para os documentos públicos do CutSync.',
      cards: SHARED_RESOURCES('business'),
    },
    faq: {
      eyebrow: 'PERGUNTAS FREQUENTES',
      title: 'Para avaliar com calma.',
      description: 'Informações diretas sobre cadastro, demonstração e operação.',
      entries: [
        { question: 'A demonstração usa dados reais?', answer: 'Não. Os dados são fictícios, mas as ações representam fluxos disponíveis no produto.' },
        { question: 'O que posso apresentar na vitrine?', answer: 'O perfil público do estabelecimento e os serviços ativos que você publicar.' },
        { question: 'Como a equipe entra no sistema?', answer: 'Cada profissional recebe um convite e acessa o próprio perfil, com visão restrita à sua agenda.' },
        { question: 'Posso bloquear horários sem atendimento?', answer: 'Sim. A unidade registra bloqueios para pausas e compromissos internos da operação.' },
        { question: 'Posso começar com uma equipe pequena?', answer: 'Sim. O cadastro contempla profissionais autônomos e estabelecimentos com equipe.' },
        { question: 'Existe valor divulgado publicamente?', answer: 'Não divulgamos preços nesta página. As condições comerciais são tratadas no contato com a equipe.' },
      ],
    },
    contact: {
      eyebrow: 'CONTATO COMERCIAL',
      title: 'Vamos entender sua operação.',
      description: 'Envie seus dados e a equipe do CutSync responde pelo e-mail informado.',
      consentLabel: 'Autorizo o CutSync a usar meus dados de contato para responder a esta solicitação comercial.',
      submitLabel: 'Falar com a equipe',
    },
    future: {
      eyebrow: 'VISÃO DE FUTURO',
      title: 'Tecnologia que cabe na rotina de quem atende.',
      paragraphs: [
        'Queremos que o estabelecimento passe menos tempo administrando mensagens e mais tempo atendendo bem.',
        'Evoluímos o CutSync em etapas verificáveis: nada entra nesta página antes de existir no produto.',
      ],
    },
    scene: {
      source: 'business',
      caption: 'Cena ilustrativa',
      alternativeText: 'Cena ilustrativa de uma proprietária e um profissional revisando juntos a agenda do estabelecimento.',
    },
  },
};

export interface LandingClientDiscovery {
  hero: {
    badge: string;
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
    businessCta: string;
    searchPlaceholder: string;
    locationPlaceholder: string;
    submitLabel: string;
  };
  trust: readonly string[];
  search: SectionCopy & {
    note: string;
    loadingLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    errorTitle: string;
    retryLabel: string;
    bookingLabel: string;
    noPriceLabel: string;
    finalCta: string;
  };
}

/** Superfície exclusiva da página do cliente: descoberta pública e entrada no agendamento. */
export const LANDING_CLIENT_DISCOVERY: LandingClientDiscovery = {
  hero: {
    badge: 'VITRINES E AGENDAS CONECTADAS',
    title: 'Encontre seu próximo horário sem depender de mensagens.',
    description: 'Pesquise por serviço ou por bairro, veja o que cada estabelecimento publicou e escolha quando agendar.',
    primaryCta: 'Explorar resultados',
    secondaryCta: 'Como funciona',
    businessCta: 'Tenho um negócio',
    searchPlaceholder: 'Estabelecimento ou serviço',
    locationPlaceholder: 'Bairro ou cidade',
    submitLabel: 'Buscar',
  },
  trust: ['Explore sem cadastro', 'Consulte serviços e valores', 'Entre apenas para confirmar'],
  search: {
    eyebrow: 'VITRINES PUBLICADAS',
    title: 'Escolha com informações reais.',
    description: 'Serviços, localização e situação informados a partir do perfil de cada estabelecimento.',
    note: 'A disponibilidade é consultada na agenda da unidade antes da confirmação do agendamento.',
    loadingLabel: 'Buscando estabelecimentos…',
    emptyTitle: 'Nenhum resultado com esses filtros.',
    emptyDescription: 'Tente outro serviço, bairro ou cidade.',
    errorTitle: 'Não foi possível atualizar a vitrine.',
    retryLabel: 'Tentar novamente',
    bookingLabel: 'Ver horários',
    noPriceLabel: 'Consulte os serviços',
    finalCta: 'Ver estabelecimentos',
  },
};

export interface LandingBusinessEvaluation {
  hero: {
    badge: string;
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
    capabilities: readonly string[];
  };
  comparison: SectionCopy & {
    pairs: readonly { id: 'messages' | 'notes' | 'catalog'; before: string; after: string; fragments: readonly [string, string] }[];
  };
  roles: SectionCopy & {
    options: readonly { id: 'owner' | 'professional'; label: string; summary: string }[];
  };
  demo: SectionCopy;
}

/** Superfície exclusiva da página de estabelecimento: avaliação da operação antes do cadastro. */
export const LANDING_BUSINESS_EVALUATION: LandingBusinessEvaluation = {
  hero: {
    badge: 'VITRINE E OPERAÇÃO CONECTADAS',
    title: 'Sua vitrine e sua agenda trabalhando juntas.',
    description: 'Publique serviços com duração e valor, receba agendamentos na agenda da unidade e organize a rotina da equipe em um só fluxo.',
    primaryCta: 'Criar meu estabelecimento',
    secondaryCta: 'Explorar demonstração',
    capabilities: ['Vitrine pública', 'Agenda da unidade', 'Catálogo de serviços', 'Equipe e escalas'],
  },
  comparison: {
    eyebrow: 'UM FLUXO MAIS CLARO',
    title: 'Reúna o que hoje fica separado.',
    description: 'O CutSync conecta a apresentação do negócio às informações usadas na rotina, sem manter duas versões da mesma agenda.',
    pairs: [
      { id: 'messages', before: 'Mensagens dispersas', after: 'Vitrine pública', fragments: ['Tem horário?', 'Qual o valor?'] },
      { id: 'notes', before: 'Anotações separadas', after: 'Agenda centralizada', fragments: ['09:30 · Corte', '11:00 · Barba'] },
      { id: 'catalog', before: 'Catálogo informal', after: 'Serviços com duração e valor', fragments: ['Corte', 'Corte + barba'] },
    ],
  },
  roles: {
    eyebrow: 'DUAS ROTINAS, UMA OPERAÇÃO',
    title: 'Cada pessoa vê o que precisa para agir.',
    description: 'A visão do dono acompanha a unidade inteira; a visão profissional mantém o foco na própria agenda.',
    options: [
      { id: 'owner', label: 'Visão do dono', summary: 'Panorama do dia da unidade, atendimentos da equipe e configuração de serviços.' },
      { id: 'professional', label: 'Visão profissional', summary: 'Agenda pessoal, próximo atendimento e conclusão do serviço, sem acesso ao restante da unidade.' },
    ],
  },
  demo: {
    eyebrow: 'PRODUTO DISPONÍVEL',
    title: 'Veja como cada parte sustenta a operação.',
    description: 'Demonstração baseada em funcionalidades disponíveis, com dados fictícios.',
  },
};

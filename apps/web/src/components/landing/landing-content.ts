export type LandingPageAudience = 'client' | 'business';

export type LandingSectionId =
  | 'hero'
  | 'proposal_values'
  | 'ecosystem'
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

export const LANDING_SECTION_ORDER: readonly LandingSectionId[] = [
  'hero',
  'proposal_values',
  'ecosystem',
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

export interface LandingNavItem {
  id: Extract<LandingSectionId, 'proposal_values' | 'services' | 'security' | 'resources' | 'contact'>;
  label: string;
}

export const LANDING_NAV_ITEMS: readonly LandingNavItem[] = [
  { id: 'proposal_values', label: 'Solução' },
  { id: 'services', label: 'Serviços' },
  { id: 'security', label: 'Confiança' },
  { id: 'resources', label: 'Recursos' },
  { id: 'contact', label: 'Contato' },
] as const;

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

const SHARED_VALUES: readonly LandingItem[] = [
  { title: 'Clareza', description: 'Cada informação exibida vem do que já foi publicado ou configurado, sem promessas fora do produto.' },
  { title: 'Autonomia', description: 'Cliente escolhe sozinho; estabelecimento define suas regras; profissional acompanha a própria rotina.' },
  { title: 'Confiança', description: 'Acesso por perfil, registros de operação e comunicação apenas para quem participa do atendimento.' },
  { title: 'Cuidado', description: 'O produto acompanha o ritmo de quem atende, com linguagem direta e nenhum dado pedido sem finalidade.' },
];

const CLIENT_ECOSYSTEM: readonly LandingEcosystemStep[] = [
  { role: 'Cliente', title: 'Descobre e agenda', description: 'Busca por serviço ou localização, consulta o catálogo publicado e escolhe um horário.' },
  { role: 'Estabelecimento', title: 'Administra a operação', description: 'Recebe a solicitação na mesma agenda em que organiza serviços, equipe e vitrine.' },
  { role: 'Profissional', title: 'Acompanha sua rotina', description: 'Vê os atendimentos do dia e conclui o que já foi realizado, sem acesso ao restante da unidade.' },
];

const BUSINESS_ECOSYSTEM: readonly LandingEcosystemStep[] = [
  { role: 'Estabelecimento', title: 'Administra a operação', description: 'Publica serviços com preço e duração, define jornadas e mantém a agenda da unidade sob controle.' },
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
      statement: 'O CutSync existe para que você veja serviços, preços informados pelo estabelecimento e horários antes de escolher — e confirme sem negociar por mensagem.',
      description: 'Quatro princípios orientam cada tela que você usa.',
      values: SHARED_VALUES,
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
        { title: 'Descoberta pública', description: 'Busca por serviço, estabelecimento, bairro ou cidade, sem cadastro.' },
        { title: 'Catálogo com preço informado', description: 'Serviços ativos com duração e valor definidos pelo estabelecimento.' },
        { title: 'Horários da unidade', description: 'Disponibilidade consultada na agenda antes da confirmação.' },
        { title: 'Confirmação com conta', description: 'O acesso é necessário apenas para concluir o agendamento.' },
        { title: 'Meus compromissos', description: 'Consulta, remarcação e cancelamento conforme as regras da unidade.' },
        { title: 'Preferências de contato', description: 'Você decide quais comunicações deseja receber.' },
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
      eyebrow: 'COMO COMEÇAR',
      title: 'Três passos até o horário confirmado.',
      description: 'Você pode explorar antes de entrar. A conta é necessária somente para concluir a reserva.',
      steps: [
        { title: 'Descubra', description: 'Busque por serviço, estabelecimento ou localização.' },
        { title: 'Escolha', description: 'Consulte o catálogo e os horários publicados pela unidade.' },
        { title: 'Confirme', description: 'Acesse sua conta apenas para finalizar o agendamento.' },
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
        { question: 'Quem define os preços?', answer: 'Cada estabelecimento informa preço e duração dos próprios serviços; o CutSync apenas apresenta o que foi publicado.' },
        { question: 'O CutSync recebe o pagamento?', answer: 'Nesta fase o CutSync organiza o agendamento. Pagamentos seguem as regras de cada estabelecimento.' },
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
      values: SHARED_VALUES,
    },
    ecosystem: {
      eyebrow: 'ECOSSISTEMA CONECTADO',
      title: 'Você administra; o profissional executa; o cliente agenda.',
      description: 'Um único fluxo conecta os três papéis, começando pela operação do estabelecimento.',
      steps: BUSINESS_ECOSYSTEM,
      note: 'O profissional acompanha apenas a própria agenda e produção; a visão da unidade permanece com a administração.',
    },
    services: {
      eyebrow: 'SERVIÇOS E CAPACIDADES',
      title: 'O que já está disponível para o seu negócio.',
      description: 'Recursos que existem hoje na experiência de estabelecimento e profissional.',
      items: [
        { title: 'Vitrine pública', description: 'Perfil, endereço e serviços ativos publicados para descoberta.' },
        { title: 'Agenda da unidade', description: 'Criação, confirmação, remarcação e conclusão de atendimentos.' },
        { title: 'Catálogo de serviços', description: 'Nome, duração, preço, ordenação e desativação consciente.' },
        { title: 'Equipe e jornadas', description: 'Convites, horários de trabalho e responsabilidades por profissional.' },
        { title: 'Visão do dono', description: 'Panorama do dia da unidade e acompanhamento dos atendimentos.' },
        { title: 'Rotina do profissional', description: 'Agenda pessoal, próximo atendimento e conclusão do serviço.' },
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
        { question: 'Posso começar com uma equipe pequena?', answer: 'Sim. O cadastro contempla profissionais autônomos e estabelecimentos com equipe.' },
        { question: 'O profissional precisa de uma conta separada?', answer: 'O profissional recebe um convite e acessa o próprio perfil, com visão restrita à sua agenda.' },
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

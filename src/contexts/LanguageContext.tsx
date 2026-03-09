import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'pt';

interface Translations {
  [key: string]: {
    [key in Language]: string;
  };
}

const translations: Translations = {
  // Navbar
  'nav.map': { en: 'Map', pt: 'Mapa' },
  'nav.events': { en: 'Events', pt: 'Eventos' },
  'nav.myEvents': { en: 'My Events', pt: 'Meus Eventos' },
  'nav.admin': { en: 'Admin', pt: 'Admin' },
  'nav.profile': { en: 'Profile', pt: 'Perfil' },
  'nav.logout': { en: 'Logout', pt: 'Sair' },
  'nav.login': { en: 'Login', pt: 'Entrar' },
  'nav.join': { en: 'Join', pt: 'Cadastrar' },
  'nav.contest': { en: 'Contest', pt: 'Concurso' },
  'nav.notifications': { en: 'Notifications', pt: 'Notificações' },

  // Home
  'home.hero.thenew': { en: 'THE NEW', pt: 'O NOVO' },
  'home.hero.badge': { en: 'The Ultimate Rider Ecosystem', pt: 'O Ecossistema Definitivo para Motociclistas' },
  'home.hero.title': { en: 'Connect with the Motorcycle World', pt: 'Conecte-se com o Mundo das Motos' },
  'home.hero.subtitle': { en: 'Whether you\'re a rider building your virtual garage, or a business serving the community. Create your unique profile and join the global network.', pt: 'Seja você um motociclista construindo sua garagem virtual, ou uma empresa servindo a comunidade. Crie seu perfil único e junte-se à rede global.' },
  'home.hero.cta': { en: 'Create Your Profile', pt: 'Crie Seu Perfil' },
  'home.hero.demo': { en: 'View Ecosystem Demo', pt: 'Ver Demo do Ecossistema' },
  'home.features.title.1': { en: 'Platform', pt: 'Recursos da' },
  'home.features.title.2': { en: 'Features', pt: 'Plataforma' },
  'home.features.subtitle': { en: 'Everything you need to connect with the motorcycle community, manage your garage, and discover new places.', pt: 'Tudo o que você precisa para se conectar com a comunidade de motociclistas, gerenciar sua garagem e descobrir novos lugares.' },
  'home.features.riders.title': { en: 'Rider Profiles', pt: 'Perfis de Motociclistas' },
  'home.features.riders.desc': { en: 'Create your unique rider profile. Showcase your virtual garage, log maintenance history, and connect with fellow enthusiasts.', pt: 'Crie seu perfil único de motociclista. Mostre sua garagem virtual, registre o histórico de manutenção e conecte-se com outros entusiastas.' },
  'home.features.ecosystem.title': { en: 'Ecosystem Network', pt: 'Rede do Ecossistema' },
  'home.features.ecosystem.desc': { en: 'Discover top-rated mechanics, dealerships, gear shops, and biker-friendly venues in your area.', pt: 'Descubra os melhores mecânicos, concessionárias, lojas de equipamentos e locais amigos dos motociclistas na sua área.' },
  'home.features.discovery.title': { en: 'Local Discovery', pt: 'Descoberta Local' },
  'home.features.discovery.desc': { en: 'Explore our interactive map to find nearby motorcycle-related businesses, popular ride routes, and meeting spots.', pt: 'Explore nosso mapa interativo para encontrar empresas relacionadas a motocicletas, rotas populares e pontos de encontro.' },
  'home.features.events.title': { en: 'Community Events', pt: 'Eventos da Comunidade' },
  'home.features.events.desc': { en: 'Stay updated with local rides, meetups, and showcases. RSVP to events and see who else is attending.', pt: 'Mantenha-se atualizado com passeios locais, encontros e exposições. Confirme presença em eventos e veja quem mais vai participar.' },
  'home.features.admin.title': { en: 'Admin Dashboard', pt: 'Painel de Administração' },
  'home.features.admin.desc': { en: 'Comprehensive moderation tools for platform administrators to manage users, approve events, and oversee content.', pt: 'Ferramentas abrangentes de moderação para administradores da plataforma gerenciarem usuários, aprovarem eventos e supervisionarem o conteúdo.' },
  'home.features.mobile.title': { en: 'Mobile Optimized', pt: 'Otimizado para Celular' },
  'home.features.mobile.desc': { en: 'A fully responsive design ensuring a seamless experience whether you\'re on your desktop or checking your phone on the road.', pt: 'Um design totalmente responsivo garantindo uma experiência perfeita, seja no seu computador ou verificando o celular na estrada.' },
  'home.architecture.title': { en: 'Architecture Roadmap', pt: 'Roteiro de Arquitetura' },
  'home.architecture.desc': { en: 'This prototype demonstrates the core functionality of the MotoConnect platform. For the production application, we recommend the following architecture:', pt: 'Este protótipo demonstra a funcionalidade principal da plataforma MotoConnect. Para a aplicação de produção, recomendamos a seguinte arquitetura:' },

  // Profile
  // Profile
  'profile.edit': { en: 'Edit Profile', pt: 'Editar Perfil' },
  'profile.connect': { en: 'Connect', pt: 'Conectar' },
  'profile.garage': { en: 'My Garage', pt: 'Minha Garagem' },
  'profile.addMoto': { en: 'Add Motorcycle', pt: 'Adicionar Moto' },
  'profile.cancel': { en: 'Cancel', pt: 'Cancelar' },
  'profile.addLog': { en: 'Add Log', pt: 'Adicionar Registro' },
  'profile.maintenance': { en: 'Maintenance History', pt: 'Histórico de Manutenção' },
  'profile.emptyGarage': { en: 'Empty Garage', pt: 'Garagem Vazia' },
  'profile.noMoto': { en: 'Add your first motorcycle to start tracking maintenance.', pt: 'Adicione sua primeira moto para começar a acompanhar a manutenção.' },
  'profile.myEvents': { en: 'My Events', pt: 'Meus Eventos' },
  'profile.hostedBy': { en: 'Hosted by', pt: 'Organizado por' },
  'profile.me': { en: 'Me', pt: 'Mim' },
  'profile.noEvents': { en: 'No Events', pt: 'Nenhum Evento' },
  'profile.noEventsDesc': { en: 'No events scheduled or attending yet.', pt: 'Nenhum evento agendado ou confirmado ainda.' },
  'profile.aboutUs': { en: 'About Us', pt: 'Sobre Nós' },
  'profile.noDetails': { en: 'No details provided.', pt: 'Nenhum detalhe fornecido.' },
  'profile.updates': { en: 'Updates & Blog', pt: 'Atualizações e Blog' },
  'profile.whatsOnMind': { en: "What's on your mind? Share a ride update or shop news...", pt: 'O que você está pensando? Compartilhe uma atualização de passeio ou novidade da loja...' },
  'profile.post': { en: 'Post', pt: 'Postar' },
  'profile.posting': { en: 'Posting...', pt: 'Postando...' },
  'profile.noUpdates': { en: 'No updates yet.', pt: 'Nenhuma atualização ainda.' },
  'profile.networkStats': { en: 'Network Stats', pt: 'Estatísticas da Rede' },
  'profile.connections': { en: 'Connections', pt: 'Conexões' },
  'profile.joined': { en: 'Joined', pt: 'Entrou' },
  'profile.contactInfo': { en: 'Contact Info', pt: 'Informações de Contato' },
  'profile.notFound': { en: 'Profile Not Found', pt: 'Perfil Não Encontrado' },
  'profile.notFoundDesc': { en: "The user or business you're looking for doesn't exist.", pt: 'O usuário ou empresa que você está procurando não existe.' },
  'profile.backHome': { en: 'Back to Home', pt: 'Voltar ao Início' },
  'profile.yearsOld': { en: 'years old', pt: 'anos' },
  'profile.make': { en: 'Make', pt: 'Marca' },
  'profile.model': { en: 'Model', pt: 'Modelo' },
  'profile.year': { en: 'Year', pt: 'Ano' },
  'profile.initialLog': { en: 'Initial Maintenance Log', pt: 'Registro de Manutenção Inicial' },
  'profile.service': { en: 'Service (e.g. Oil Change)', pt: 'Serviço (ex. Troca de Óleo)' },
  'profile.shop': { en: 'Shop', pt: 'Oficina' },
  'profile.adding': { en: 'Adding...', pt: 'Adicionando...' },
  'profile.addToGarage': { en: 'Add to Garage', pt: 'Adicionar à Garagem' },
  'profile.saveLog': { en: 'Save Log', pt: 'Salvar Registro' },
  'profile.saving': { en: 'Saving...', pt: 'Salvando...' },
  'profile.attending': { en: 'Attending', pt: 'Confirmado' },
  'profile.updateInfo': { en: 'Update your information for', pt: 'Atualize suas informações para' },
  'profile.save': { en: 'Save Changes', pt: 'Salvar Alterações' },
  'profile.share': { en: 'Share', pt: 'Compartilhar' },

  // Admin
  'admin.title': { en: 'Admin Dashboard', pt: 'Painel de Administração' },
  'admin.subtitle': { en: 'Manage users, access control, and moderation.', pt: 'Gerencie usuários, controle de acesso e moderação.' },
  'admin.tab.users': { en: 'Users', pt: 'Usuários' },
  'admin.tab.events': { en: 'Events', pt: 'Eventos' },
  'admin.tab.submissions': { en: 'Submissions', pt: 'Submissões' },
  'admin.tab.settings': { en: 'Settings', pt: 'Configurações' },
  'admin.search.users': { en: 'Search users...', pt: 'Buscar usuários...' },
  'admin.search.events': { en: 'Search events...', pt: 'Buscar eventos...' },
  'admin.table.user': { en: 'User', pt: 'Usuário' },
  'admin.table.type': { en: 'Type', pt: 'Tipo' },
  'admin.table.role': { en: 'Role', pt: 'Função' },
  'admin.table.joined': { en: 'Joined', pt: 'Entrou em' },
  'admin.table.status': { en: 'Status', pt: 'Status' },
  'admin.table.actions': { en: 'Actions', pt: 'Ações' },
  'admin.table.event': { en: 'Event', pt: 'Evento' },
  'admin.table.host': { en: 'Host', pt: 'Organizador' },
  'admin.table.date': { en: 'Date', pt: 'Data' },
  'admin.table.promoted': { en: 'Promoted', pt: 'Promovido' },
  'admin.table.photo': { en: 'Photo', pt: 'Foto' },
  'admin.table.contest': { en: 'Contest', pt: 'Concurso' },
  'admin.noUsers': { en: 'No users found', pt: 'Nenhum usuário encontrado' },
  'admin.noEvents': { en: 'No events found', pt: 'Nenhum evento encontrado' },
  'admin.settings.title': { en: 'Platform Settings', pt: 'Configurações da Plataforma' },
  'admin.settings.interface': { en: 'Interface Features', pt: 'Recursos de Interface' },
  'admin.settings.fullscreen': { en: 'Enable Fullscreen Feature', pt: 'Ativar Recurso de Tela Cheia' },
  'admin.settings.fullscreenDesc': { en: 'Adds a fullscreen toggle to the navigation bar', pt: 'Adiciona um botão de tela cheia na barra de navegação' },
  'admin.settings.registration': { en: 'Registration Policy', pt: 'Política de Registro' },
  'admin.settings.approval': { en: 'Require approval for Ecosystems', pt: 'Exigir aprovação para Ecossistemas' },
  'admin.settings.allowRiders': { en: 'Allow new Rider registrations', pt: 'Permitir novos registros de Motociclistas' },
  'admin.settings.moderation': { en: 'Content Moderation', pt: 'Moderação de Conteúdo' },
  'admin.settings.autoHide': { en: 'Auto-hide reported posts', pt: 'Ocultar automaticamente posts denunciados' },
  'admin.settings.aiFilter': { en: 'Enable AI image filtering', pt: 'Ativar filtragem de imagem por IA' },
  'admin.settings.save': { en: 'Save Changes', pt: 'Salvar Alterações' },
  'admin.accessDenied': { en: 'Access Denied', pt: 'Acesso Negado' },
  'admin.noPermission': { en: 'You do not have permission to view this page.', pt: 'Você não tem permissão para ver esta página.' },
  'admin.goToLogin': { en: 'Go to Admin Login', pt: 'Ir para Login de Admin' },
  'admin.status.active': { en: 'Active', pt: 'Ativo' },
  'admin.status.pending': { en: 'Pending', pt: 'Pendente' },
  'admin.status.banned': { en: 'Banned', pt: 'Banido' },
  'admin.status.approved': { en: 'Approved', pt: 'Aprovado' },
  'admin.status.standard': { en: 'Standard', pt: 'Padrão' },

  // Map
  'map.title': { en: 'Ecosystem Map', pt: 'Mapa do Ecossistema' },
  'map.subtitle': { en: 'Discover repair shops, dealerships, and biker-friendly spots around you.', pt: 'Descubra oficinas, concessionárias e locais amigos dos motociclistas perto de você.' },
  'map.legend': { en: 'Legend', pt: 'Legenda' },
  'map.viewProfile': { en: 'View Profile', pt: 'Ver Perfil' },

  // Categories
  'category.dealership': { en: 'Dealership', pt: 'Concessionária' },
  'category.gear_shop': { en: 'Gear Shop', pt: 'Loja de Equipamentos' },
  'category.parts_store': { en: 'Parts Store', pt: 'Loja de Peças' },
  'category.workshop': { en: 'Workshop', pt: 'Oficina' },
  'category.meeting_spot': { en: 'Meeting Spot', pt: 'Ponto de Encontro' },
  'category.ride_spot': { en: 'Ride Spot', pt: 'Ponto de Passeio' },
  'category.biker_cafe': { en: 'Biker Cafe', pt: 'Café Motociclista' },
  'category.biker_bar': { en: 'Biker Bar', pt: 'Bar Motociclista' },
  'category.ride_stop': { en: 'Ride Stop', pt: 'Parada de Passeio' },
  'category.motoclub': { en: 'Moto Club', pt: 'Moto Clube' },
  'category.ride_route': { en: 'Ride Route', pt: 'Rota de Passeio' },

  // Events
  'events.title': { en: 'Upcoming Events', pt: 'Próximos Eventos' },
  'events.subtitle': { en: 'Rides, meetups, and showcases in your area.', pt: 'Passeios, encontros e exposições na sua área.' },
  'events.filter.title': { en: 'Filter by title...', pt: 'Filtrar por título...' },
  'events.filter.location': { en: 'Filter by location...', pt: 'Filtrar por local...' },
  'events.create': { en: 'Create Event', pt: 'Criar Evento' },
  'events.promoted': { en: 'Promoted', pt: 'Promovido' },
  'events.attending': { en: 'Attending', pt: 'Confirmado' },
  'events.rsvp': { en: 'RSVP', pt: 'Confirmar' },
  'events.noFound': { en: 'No Events Found', pt: 'Nenhum Evento Encontrado' },
  'events.checkBack': { en: 'Check back later for upcoming rides and meetups.', pt: 'Volte mais tarde para novos passeios e encontros.' },
  'events.submitPhoto': { en: 'Submit Photo', pt: 'Enviar Foto' },
  'events.vote': { en: 'Vote', pt: 'Votar' },
  'events.unpromote': { en: 'Unpromote', pt: 'Remover Promoção' },
  'events.promote': { en: 'Promote', pt: 'Promover' },
  'events.noHosted': { en: 'No hosted events yet', pt: 'Nenhum evento criado ainda' },
  'events.notAttending': { en: 'Not attending any events yet', pt: 'Não está participando de nenhum evento ainda' },

  // Create Event Modal
  'event.modal.title': { en: 'Create New Event', pt: 'Criar Novo Evento' },
  'event.modal.editTitle': { en: 'Edit Event', pt: 'Editar Evento' },
  'event.modal.subtitle': { en: 'Share your next ride or meetup with the community.', pt: 'Compartilhe seu próximo passeio ou encontro com a comunidade.' },
  'event.field.title': { en: 'Event Title', pt: 'Título do Evento' },
  'event.field.date': { en: 'Date', pt: 'Data' },
  'event.field.time': { en: 'Time', pt: 'Hora' },
  'event.field.location': { en: 'Location', pt: 'Local' },
  'event.field.image': { en: 'Event Image', pt: 'Imagem do Evento' },
  'event.field.upload': { en: 'Upload', pt: 'Enviar' },
  'event.field.remove': { en: 'Remove Image', pt: 'Remover Imagem' },
  'event.field.description': { en: 'Description', pt: 'Descrição' },
  'event.btn.publish': { en: 'Publish Event', pt: 'Publicar Evento' },
  'event.btn.update': { en: 'Update Event', pt: 'Atualizar Evento' },
  'event.btn.creating': { en: 'Creating...', pt: 'Criando...' },
  'event.btn.updating': { en: 'Updating...', pt: 'Atualizando...' },
  'event.preview.noImage': { en: 'No image selected', pt: 'Nenhuma imagem selecionada' },
  'event.preview.title': { en: 'Preview', pt: 'Pré-visualização' },
  'event.upload.desc': { en: 'Upload a cover image for your event. Recommended size: 1200x600px.', pt: 'Envie uma imagem de capa para o seu evento. Tamanho recomendado: 1200x600px.' },

  // Event Details
  'eventDetails.back': { en: 'Back to Events', pt: 'Voltar para Eventos' },
  'eventDetails.date': { en: 'Date', pt: 'Data' },
  'eventDetails.time': { en: 'Time', pt: 'Hora' },
  'eventDetails.location': { en: 'Location', pt: 'Local' },
  'eventDetails.attendance': { en: 'Attendance', pt: 'Participantes' },
  'eventDetails.riders': { en: 'Riders', pt: 'Motociclistas' },
  'eventDetails.about': { en: 'About this event', pt: 'Sobre este evento' },
  'eventDetails.hostedBy': { en: 'Hosted by', pt: 'Organizado por' },
  'event.details.posted': { en: 'Posted', pt: 'Postado em' },
  'event.details.attendance': { en: 'Attendance', pt: 'Participantes' },
  'event.details.ridersAttending': { en: 'Riders Attending', pt: 'Motociclistas Confirmados' },
  'event.details.rsvpNow': { en: 'RSVP Now', pt: 'Confirmar Agora' },
  'event.details.imAttending': { en: 'I\'m Attending', pt: 'Eu Vou' },
  'event.details.share': { en: 'Share Event', pt: 'Compartilhar Evento' },
  'event.details.about': { en: 'About this event', pt: 'Sobre este evento' },
  'event.details.hostedBy': { en: 'Hosted by', pt: 'Organizado por' },
  'event.details.viewProfile': { en: 'View Profile', pt: 'Ver Perfil' },

  // Profile
  'profile.updateInfo': { en: 'Update your information for', pt: 'Atualize suas informações para' },
  'profile.save': { en: 'Save Changes', pt: 'Salvar Alterações' },
  'profile.share': { en: 'Share', pt: 'Compartilhar' },

  // My Events Page
  'myEvents.title': { en: 'My Events', pt: 'Meus Eventos' },
  'myEvents.subtitle': { en: 'Events you\'re hosting or attending.', pt: 'Eventos que você está organizando ou participando.' },
  'myEvents.hosting': { en: 'Hosting', pt: 'Organizando' },
  'myEvents.attending': { en: 'Attending', pt: 'Participando' },
  'myEvents.noEvents': { en: 'No Events Yet', pt: 'Nenhum Evento Ainda' },
  'myEvents.noEventsDesc': { en: 'You haven\'t created or RSVP\'d to any events.', pt: 'Você ainda não criou nem confirmou presença em nenhum evento.' },
  'myEvents.browse': { en: 'Browse Events', pt: 'Ver Eventos' },

  // Login
  'login.enter': { en: 'Enter Café777.app', pt: 'Entrar no Café777.app' },
  'login.skip': { en: 'Skip Intro', pt: 'Pular Intro' },
  'login.welcome': { en: 'Welcome Back', pt: 'Bem-vindo de volta' },
  'login.subtitle': { en: 'Login to Café777', pt: 'Entre no Café777' },
  'login.email': { en: 'Email Address', pt: 'Endereço de E-mail' },
  'login.password': { en: 'Password', pt: 'Senha' },
  'login.noAccount': { en: 'Don\'t have an account?', pt: 'Não tem uma conta?' },
  'login.admin': { en: 'Administrator Access', pt: 'Acesso Administrativo' },

  // Register
  'register.subtitle': { en: 'Create your unique profile page', pt: 'Crie sua página de perfil única' },
  'register.type.rider': { en: 'Rider', pt: 'Motociclista' },
  'register.type.ecosystem': { en: 'Ecosystem', pt: 'Ecossistema' },
  'register.username': { en: 'Username (URL)', pt: 'Nome de Usuário (URL)' },
  'register.fullName': { en: 'Full Name', pt: 'Nome Completo' },
  'register.age': { en: 'Age', pt: 'Idade' },
  'register.city': { en: 'City', pt: 'Cidade' },
  'register.companyName': { en: 'Company Name', pt: 'Nome da Empresa' },
  'register.category': { en: 'Category', pt: 'Categoria' },
  'register.address': { en: 'Full Address', pt: 'Endereço Completo' },
  'register.bio': { en: 'Details / Bio', pt: 'Detalhes / Bio' },
  'register.create': { en: 'Create Profile', pt: 'Criar Perfil' },
  'register.success': { en: 'Registration Received!', pt: 'Registro Recebido!' },
  'register.successDesc': { en: 'Thank you for joining the Café777 Ecosystem. Your registration is currently pending administrator approval. We will review your application and activate your account shortly.', pt: 'Obrigado por se juntar ao Ecossistema Café777. Seu registro está pendente de aprovação do administrador. Analisaremos sua solicitação e ativaremos sua conta em breve.' },
  'register.backToLogin': { en: 'Back to Login', pt: 'Voltar para o Login' },

  // Auth (legacy/shared)
  'auth.login.title': { en: 'Welcome Back', pt: 'Bem-vindo de volta' },
  'auth.login.subtitle': { en: 'Sign in to your account', pt: 'Entre na sua conta' },
  'auth.register.title': { en: 'Join the Community', pt: 'Junte-se à Comunidade' },
  'auth.register.subtitle': { en: 'Create your account', pt: 'Crie sua conta' },
  'auth.field.username': { en: 'Username', pt: 'Usuário' },
  'auth.field.password': { en: 'Password', pt: 'Senha' },
  'auth.btn.login': { en: 'Sign In', pt: 'Entrar' },
  'auth.btn.register': { en: 'Create Account', pt: 'Criar Conta' },
  'auth.noAccount': { en: 'Don\'t have an account?', pt: 'Não tem uma conta?' },
  'auth.hasAccount': { en: 'Already have an account?', pt: 'Já tem uma conta?' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved as Language) || 'pt';
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: string) => {
    if (!translations[key]) {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
    return translations[key][language];
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

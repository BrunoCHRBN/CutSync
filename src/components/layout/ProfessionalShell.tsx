import React, { ReactNode } from 'react';
import { CalendarDays, ShieldCheck, UserRound } from 'lucide-react-native';
import { OperationalShell } from './operational-shell';

interface ProfessionalShellProps {
  children: ReactNode;
  name?: string;
  shopName?: string;
  onSignOut: () => void;
  testID: string;
  isOffline?: boolean;
  activeRoute?: 'agenda' | 'profile' | 'security';
  contentMode?: 'standard' | 'wide' | 'fixed';
  scroll?: boolean;
}

const navItems = [
  { key: 'agenda', label: 'Agenda', path: '/(professional)', icon: CalendarDays },
  { key: 'profile', label: 'Meu perfil', path: '/professional-profile', icon: UserRound },
  { key: 'security', label: 'Segurança', path: '/security', icon: ShieldCheck },
] as const;

export const ProfessionalShell = ({
  children,
  name,
  shopName,
  onSignOut,
  testID,
  isOffline = false,
  activeRoute = 'agenda',
  contentMode = 'wide',
  scroll = false,
}: ProfessionalShellProps) => (
  <OperationalShell
    testID={testID}
    idPrefix="professional"
    activeRoute={activeRoute}
    navItems={navItems}
    shopName={shopName || 'Estabelecimento'}
    userName={name}
    roleLabel="Minha operação"
    onSignOut={onSignOut}
    isOffline={isOffline}
    contentMode={contentMode}
    scroll={scroll}
  >
    {children}
  </OperationalShell>
);

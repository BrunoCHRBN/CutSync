import type { BusinessService, BusinessTeamMember } from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import { businessQueryClient, createBusinessQueryKey } from '@/features/connectivity/business-query';
import { businessServicesApi } from '@/features/services/business-services-api';
import { useBusinessServices } from '@/features/services/use-business-services';
import { useBusinessTeam } from '@/features/team/use-business-team';
import { businessTheme } from '@/theme/business-theme';

type ServiceCommand =
  | { type: 'update'; requestId: string; service: BusinessService; name: string; price: number; durationMinutes: number }
  | { type: 'status'; requestId: string; service: BusinessService }
  | { type: 'reorder'; requestId: string; serviceIds: string[] }
  | { type: 'associate'; requestId: string; service: BusinessService; professionalId: string; price: number; durationMinutes: number };
type ServiceCommandInput = ServiceCommand extends infer Command
  ? Command extends ServiceCommand ? Omit<Command, 'requestId'> : never
  : never;

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const parseNumber = (value: string) => Number(value.replace(',', '.'));
const messageFor = (error: unknown) => error instanceof BusinessFeatureError
  ? error.message
  : 'Não foi possível atualizar o catálogo.';

export function BusinessServicesScreen() {
  const router = useRouter();
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const services = useBusinessServices();
  const team = useBusinessTeam();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const createRequestId = useRef<string | null>(null);
  const [lastCommand, setLastCommand] = useState<ServiceCommand | null>(null);
  const canManage = hasCapability('manage_services') && activeContext?.accessMode === 'full';

  const invalidate = async () => {
    if (!user || !activeContext) return;
    await businessQueryClient.invalidateQueries({
      queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'services'),
    });
  };

  const createService = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      createRequestId.current ??= createMobileRequestId();
      return businessServicesApi.create(activeContext.establishmentId, createRequestId.current, {
        name,
        price: parseNumber(price),
        durationMinutes: Number(duration),
      });
    },
    onSuccess: async () => {
      createRequestId.current = null;
      setName(''); setPrice(''); setDuration(''); setCreating(false);
      await invalidate();
    },
  });

  const command = useMutation({
    retry: false,
    mutationFn: async (input: ServiceCommand) => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      setLastCommand(input);
      if (input.type === 'update') {
        return businessServicesApi.update(activeContext.establishmentId, input.service.id, input.requestId, {
          name: input.name,
          price: input.price,
          durationMinutes: input.durationMinutes,
          sortOrder: input.service.sortOrder,
        });
      }
      if (input.type === 'status') {
        return businessServicesApi.setStatus(activeContext.establishmentId, input.service.id, !input.service.isActive, input.requestId);
      }
      if (input.type === 'reorder') {
        return businessServicesApi.reorder(activeContext.establishmentId, input.serviceIds, input.requestId);
      }
      return businessServicesApi.associateProfessional({
        establishmentId: activeContext.establishmentId,
        professionalId: input.professionalId,
        serviceId: input.service.id,
        price: input.price,
        durationMinutes: input.durationMinutes,
        isActive: true,
        requestId: input.requestId,
      });
    },
    onSuccess: async () => {
      setLastCommand(null);
      await invalidate();
    },
  });

  const move = (index: number, direction: -1 | 1) => {
    const ordered = [...(services.data ?? [])];
    const target = index + direction;
    if (!ordered[index] || !ordered[target]) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    command.mutate({ type: 'reorder', requestId: createMobileRequestId(), serviceIds: ordered.map((item) => item.id) });
  };

  return (
    <BusinessPage testID="business-services-screen">
      <BusinessHeader eyebrow="CATÁLOGO" title="Serviços" description={activeContext?.establishmentName} />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      {!hasCapability('view_services') ? <BusinessNotice tone="danger" message="Seu papel não possui acesso ao catálogo." /> : null}
      {canManage ? <BusinessButton label={creating ? 'Fechar cadastro' : 'Criar serviço'} variant="secondary" onPress={() => setCreating((value) => !value)} /> : null}
      {creating ? (
        <BusinessCard style={styles.form}>
          <BusinessSectionTitle>Novo serviço</BusinessSectionTitle>
          <TextInput value={name} onChangeText={(value) => { setName(value); createRequestId.current = null; createService.reset(); }} placeholder="Nome" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
          <TextInput value={price} onChangeText={(value) => { setPrice(value); createRequestId.current = null; createService.reset(); }} placeholder="Preço de tabela" placeholderTextColor={businessTheme.colors.textMuted} keyboardType="decimal-pad" style={styles.input} />
          <TextInput value={duration} onChangeText={(value) => { setDuration(value); createRequestId.current = null; createService.reset(); }} placeholder="Duração em minutos" placeholderTextColor={businessTheme.colors.textMuted} keyboardType="number-pad" style={styles.input} />
          {createService.error ? <BusinessNotice tone="danger" message={messageFor(createService.error)} /> : null}
          <BusinessButton label={createService.isError && createRequestId.current ? 'Tentar novamente com o mesmo comando' : 'Salvar serviço'} loading={createService.isPending} onPress={() => createService.mutate()} />
        </BusinessCard>
      ) : null}

      {command.error ? (
        <BusinessCard>
          <BusinessNotice tone="danger" message={messageFor(command.error)} />
          {lastCommand ? <BusinessButton label="Repetir o mesmo comando" variant="secondary" onPress={() => command.mutate(lastCommand)} /> : null}
        </BusinessCard>
      ) : null}

      <View style={styles.list}>
        {services.isLoading ? <BusinessNotice message="Carregando catálogo…" /> : null}
        {services.error ? <BusinessNotice tone="danger" message={messageFor(services.error)} /> : null}
        {services.data?.map((service, index) => (
          <ServiceCard
            key={service.id}
            service={service}
            professionals={(team.data?.members ?? []).filter((member) => member.status === 'active')}
            professionalsLoading={team.isLoading}
            professionalsError={team.error}
            canManage={canManage}
            busy={command.isPending}
            onCommand={(input) => command.mutate({ ...input, requestId: createMobileRequestId() } as ServiceCommand)}
            onMoveUp={() => move(index, -1)}
            onMoveDown={() => move(index, 1)}
            canMoveUp={index > 0}
            canMoveDown={index < (services.data?.length ?? 0) - 1}
          />
        ))}
      </View>
    </BusinessPage>
  );
}

function ServiceCard({
  service,
  professionals,
  professionalsLoading,
  professionalsError,
  canManage,
  busy,
  onCommand,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  service: BusinessService;
  professionals: BusinessTeamMember[];
  professionalsLoading: boolean;
  professionalsError: unknown;
  canManage: boolean;
  busy: boolean;
  onCommand: (input: ServiceCommandInput) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [associating, setAssociating] = useState(false);
  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(String(service.price));
  const [duration, setDuration] = useState(String(service.durationMinutes));
  const [professionalId, setProfessionalId] = useState('');
  const [professionalPrice, setProfessionalPrice] = useState(String(service.price));
  const [professionalDuration, setProfessionalDuration] = useState(String(service.durationMinutes));
  return (
    <BusinessCard>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text selectable style={styles.title}>{service.name}</Text>
          <Text selectable style={styles.meta}>{currency.format(service.price)} · {service.durationMinutes} min</Text>
        </View>
        <BusinessPill label={service.isActive ? 'Ativo' : 'Pausado'} tone={service.isActive ? 'success' : 'warning'} />
      </View>
      <Text selectable style={styles.meta}>{service.professionalServices.length} configuração(ões) profissional(is)</Text>
      {editing ? (
        <View style={styles.form}>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
          <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={styles.input} />
          <TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" style={styles.input} />
          <BusinessButton label="Salvar" loading={busy} onPress={() => onCommand({ type: 'update', service, name, price: parseNumber(price), durationMinutes: Number(duration) })} />
        </View>
      ) : null}
      {associating ? (
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>Profissional</Text>
          {professionalsLoading ? <BusinessNotice message="Carregando equipe autorizada…" /> : null}
          {professionalsError ? <BusinessNotice tone="danger" message="Não foi possível carregar a equipe." /> : null}
          {!professionalsLoading && !professionalsError && professionals.length === 0 ? (
            <BusinessNotice message="Nenhum membro ativo disponível para associação." />
          ) : null}
          <View style={styles.selector}>
            {professionals.map((professional) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: professionalId === professional.profileId }}
                key={professional.profileId}
                onPress={() => setProfessionalId(professional.profileId)}
                style={[
                  styles.choice,
                  professionalId === professional.profileId && styles.choiceSelected,
                ]}
              >
                <Text style={styles.choiceText}>{professional.name}</Text>
                <Text style={styles.choiceMeta}>
                  {professional.role === 'admin' ? 'Administrador' : 'Profissional'}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={professionalPrice} onChangeText={setProfessionalPrice} placeholder="Preço específico" placeholderTextColor={businessTheme.colors.textMuted} keyboardType="decimal-pad" style={styles.input} />
          <TextInput value={professionalDuration} onChangeText={setProfessionalDuration} placeholder="Duração específica" placeholderTextColor={businessTheme.colors.textMuted} keyboardType="number-pad" style={styles.input} />
          <BusinessButton label="Associar profissional" loading={busy} disabled={!professionalId} onPress={() => onCommand({ type: 'associate', service, professionalId, price: parseNumber(professionalPrice), durationMinutes: Number(professionalDuration) })} />
        </View>
      ) : null}
      {canManage ? (
        <View style={styles.actions}>
          <BusinessButton label={editing ? 'Fechar edição' : 'Editar'} variant="secondary" disabled={busy} onPress={() => setEditing((value) => !value)} />
          <BusinessButton label={service.isActive ? 'Pausar' : 'Ativar'} variant={service.isActive ? 'danger' : 'secondary'} disabled={busy} onPress={() => onCommand({ type: 'status', service })} />
          <BusinessButton label={associating ? 'Fechar associação' : 'Associar profissional'} variant="secondary" disabled={busy} onPress={() => setAssociating((value) => !value)} />
          <View style={styles.orderActions}>
            <BusinessButton label="Subir" variant="ghost" disabled={!canMoveUp || busy} onPress={onMoveUp} />
            <BusinessButton label="Descer" variant="ghost" disabled={!canMoveDown || busy} onPress={onMoveDown} />
          </View>
        </View>
      ) : null}
    </BusinessCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: businessTheme.spacing.sm },
  form: { gap: businessTheme.spacing.sm },
  row: { flexDirection: 'row', gap: businessTheme.spacing.md, alignItems: 'flex-start' },
  copy: { flex: 1, gap: businessTheme.spacing.xxs },
  title: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  meta: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  fieldLabel: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  input: { minHeight: businessTheme.sizing.control, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, paddingHorizontal: businessTheme.spacing.md, backgroundColor: businessTheme.colors.canvasRaised, color: businessTheme.colors.text },
  selector: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  choice: { minWidth: 140, minHeight: 52, justifyContent: 'center', paddingHorizontal: businessTheme.spacing.md, paddingVertical: businessTheme.spacing.xs, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surfaceMuted },
  choiceSelected: { borderWidth: 1, borderColor: businessTheme.colors.accent },
  choiceText: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  choiceMeta: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  actions: { gap: businessTheme.spacing.sm },
  orderActions: { flexDirection: 'row', gap: businessTheme.spacing.sm },
});

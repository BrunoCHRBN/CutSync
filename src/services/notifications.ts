import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configurar comportamento das notificações em primeiro plano (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

export async function scheduleAppointmentNotification(
  appointmentId: string,
  barbershopName: string,
  dateTime: Date
) {
  if (Platform.OS === 'web') return null;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  // Cancelar se houver alguma notificação agendada anteriormente para este ID
  await cancelAppointmentNotification(appointmentId);

  // Lembrete padrão: 1 hora antes do agendamento
  const triggerTime = new Date(dateTime.getTime() - 60 * 60 * 1000);
  const now = new Date();

  if (dateTime.getTime() <= now.getTime()) {
    return null; // Horário já passou
  }

  // Se o horário do lembrete (1h antes) já passou, agenda para 5 segundos no futuro
  const trigger = triggerTime.getTime() > now.getTime() ? triggerTime : new Date(now.getTime() + 5000);

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Lembrete de Corte 💈',
      body: `Seu horário na ${barbershopName} está chegando! Às ${dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
      data: { appointmentId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: trigger,
    },
  });

  return notificationId;
}

export async function cancelAppointmentNotification(appointmentId: string) {
  if (Platform.OS === 'web') return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const target = scheduled.find(
    (n) => n.content.data?.appointmentId === appointmentId
  );

  if (target) {
    await Notifications.cancelScheduledNotificationAsync(target.identifier);
  }
}

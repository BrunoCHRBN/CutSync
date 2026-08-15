import { Stack } from 'expo-router';

import { BusinessAppointmentDetailScreen } from '@/screens/appointment-detail';
import { businessTheme } from '@/theme/business-theme';

export default function BusinessAppointmentDetailRoute() {
  return (
    <>
      <Stack.Screen options={{
        presentation: 'formSheet',
        animation: 'slide_from_bottom',
        sheetAllowedDetents: [0.9],
        sheetGrabberVisible: true,
        contentStyle: { backgroundColor: businessTheme.colors.canvas },
      }} />
      <BusinessAppointmentDetailScreen />
    </>
  );
}


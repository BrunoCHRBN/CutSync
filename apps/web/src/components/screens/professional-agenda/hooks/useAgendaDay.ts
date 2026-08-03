import { useMemo, useState } from 'react';
import { parseSchedule, getTodayInTimeZone } from '@cutsync/domain';

const defaultSchedule = [
  { day: 1, name: 'Segunda-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 2, name: 'Terça-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 3, name: 'Quarta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 4, name: 'Quinta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 5, name: 'Sexta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 6, name: 'Sábado', isOpen: true, open: '09:00', close: '20:00' },
  { day: 0, name: 'Domingo', isOpen: false, open: '09:00', close: '18:00' },
];

export function useAgendaDay(options: {
  timezone?: string | null;
  professionalWorkHours?: string | null;
  establishmentOpeningHours?: string | null;
}) {
  const [selectedDate, setSelectedDate] = useState(() =>
    options.timezone ? getTodayInTimeZone(options.timezone) : new Date());

  const selectedRange = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [selectedDate]);

  const weekRange = useMemo(() => {
    const start = new Date(selectedDate);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [selectedDate]);

  const professionalSchedule = useMemo(
    () => (options.professionalWorkHours ? parseSchedule(options.professionalWorkHours) : []),
    [options.professionalWorkHours],
  );
  const establishmentSchedule = useMemo(
    () => parseSchedule(options.establishmentOpeningHours),
    [options.establishmentOpeningHours],
  );

  const selectedWorkingDay = useMemo(
    () => professionalSchedule.find((day) => day.day === selectedDate.getDay())
      || establishmentSchedule.find((day) => day.day === selectedDate.getDay())
      || defaultSchedule.find((day) => day.day === selectedDate.getDay()),
    [establishmentSchedule, professionalSchedule, selectedDate],
  );

  return {
    selectedDate,
    setSelectedDate,
    selectedRange,
    weekRange,
    selectedWorkingDay,
  };
}

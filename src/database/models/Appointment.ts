import { Model } from '@nozbe/watermelondb';
import { text, date, relation, field } from '@nozbe/watermelondb/decorators';

export default class Appointment extends Model {
  static table = 'appointments';

  static associations = {
    barbershops: { type: 'belongs_to', key: 'barbershop_id' },
    profiles: { type: 'belongs_to', key: 'client_id' },
    services: { type: 'belongs_to', key: 'service_id' },
  } as const;

  @text('barbershop_id') barbershopId!: string;
  @text('client_id') clientId?: string;
  @text('client_name') clientName?: string;
  @text('barber_id') barberId!: string;
  @text('service_id') serviceId!: string;
  @date('date_time') dateTime!: Date;
  @text('status') status!: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  @text('cancellation_reason') cancellationReason?: string;
  @text('cancelled_by_role') cancelledByRole?: 'client' | 'barber' | 'admin';
  @field('reschedule_count') rescheduleCount!: number;
  @date('original_date_time') originalDateTime?: Date;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('barbershops', 'barbershop_id') barbershop!: any;
  @relation('profiles', 'client_id') client!: any;
  @relation('profiles', 'barber_id') barber!: any;
  @relation('services', 'service_id') service!: any;
}

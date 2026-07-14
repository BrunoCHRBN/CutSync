import { Model } from '@nozbe/watermelondb';
import { text, date, relation, field } from '@nozbe/watermelondb/decorators';

export default class Appointment extends Model {
  static table = 'appointments';

  static associations = {
    establishments: { type: 'belongs_to', key: 'establishment_id' },
    profiles: { type: 'belongs_to', key: 'client_id' },
    services: { type: 'belongs_to', key: 'service_id' },
  } as const;

  @text('establishment_id') establishmentId!: string;
  @text('client_id') clientId?: string;
  @text('client_name') clientName?: string;
  @text('professional_id') professionalId!: string;
  @text('service_id') serviceId!: string;
  @date('date_time') dateTime!: Date;
  @text('status') status!: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  @text('cancellation_reason') cancellationReason?: string;
  @text('cancelled_by_role') cancelledByRole?: 'client' | 'professional' | 'admin';
  @field('reschedule_count') rescheduleCount!: number;
  @date('original_date_time') originalDateTime?: Date;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('establishments', 'establishment_id') establishment!: any;
  @relation('profiles', 'client_id') client!: any;
  @relation('profiles', 'professional_id') professional!: any;
  @relation('services', 'service_id') service!: any;
}

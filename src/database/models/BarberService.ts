import { Model } from '@nozbe/watermelondb';
import { text, date, relation, field } from '@nozbe/watermelondb/decorators';

export default class BarberService extends Model {
  static table = 'barber_services';

  static associations = {
    barbershops: { type: 'belongs_to', key: 'barbershop_id' },
    profiles: { type: 'belongs_to', key: 'barber_id' },
    services: { type: 'belongs_to', key: 'service_id' },
  } as const;

  @text('barbershop_id') barbershopId!: string;
  @text('barber_id') barberId!: string;
  @text('service_id') serviceId!: string;
  
  @field('price') price!: number;
  @field('duration_minutes') durationMinutes!: number;
  @field('is_active') isActive!: boolean;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('barbershops', 'barbershop_id') barbershop!: any;
  @relation('profiles', 'barber_id') barber!: any;
  @relation('services', 'service_id') service!: any;
}

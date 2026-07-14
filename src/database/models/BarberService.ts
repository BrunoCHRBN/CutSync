import { Model } from '@nozbe/watermelondb';
import { text, date, relation, field } from '@nozbe/watermelondb/decorators';

export default class ProfessionalService extends Model {
  static table = 'professional_services';

  static associations = {
    establishments: { type: 'belongs_to', key: 'establishment_id' },
    profiles: { type: 'belongs_to', key: 'professional_id' },
    services: { type: 'belongs_to', key: 'service_id' },
  } as const;

  @text('establishment_id') establishmentId!: string;
  @text('professional_id') professionalId!: string;
  @text('service_id') serviceId!: string;
  
  @field('price') price!: number;
  @field('duration_minutes') durationMinutes!: number;
  @field('is_active') isActive!: boolean;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('establishments', 'establishment_id') establishment!: any;
  @relation('profiles', 'professional_id') professional!: any;
  @relation('services', 'service_id') service!: any;
}

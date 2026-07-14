import { Model } from '@nozbe/watermelondb';
import { text, date, relation, field } from '@nozbe/watermelondb/decorators';

export default class Profile extends Model {
  static table = 'profiles';

  static associations = {
    establishments: { type: 'belongs_to', key: 'establishment_id' },
    appointments: { type: 'has_many', foreignKey: 'client_id' },
  } as const;

  @text('establishment_id') establishmentId?: string | null;
  @text('name') name!: string;
  @text('role') role!: 'client' | 'professional' | 'admin';
  @text('email') email!: string;
  @text('phone') phone?: string;
  @text('avatar_url') avatarUrl?: string;
  @field('commission_rate') commissionRate?: number;
  @text('push_token') pushToken?: string | null;
  @text('work_hours') workHours?: string | null;
  @text('specialties') specialties?: string | null;
  @text('instagram') instagram?: string | null;
  @text('titulo_profissional') tituloProfissional?: string | null;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('establishments', 'establishment_id') establishment!: any;
}

import { Model } from '@nozbe/watermelondb';
import { text, date, relation } from '@nozbe/watermelondb/decorators';

export default class Profile extends Model {
  static table = 'profiles';

  static associations = {
    barbershops: { type: 'belongs_to', key: 'barbershop_id' },
    appointments: { type: 'has_many', foreignKey: 'client_id' },
  } as const;

  @text('barbershop_id') barbershopId?: string;
  @text('name') name!: string;
  @text('role') role!: 'client' | 'barber' | 'admin';
  @text('email') email!: string;
  @text('phone') phone?: string;
  @text('avatar_url') avatarUrl?: string;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('barbershops', 'barbershop_id') barbershop!: any;
}

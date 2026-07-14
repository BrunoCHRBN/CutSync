import { Model } from '@nozbe/watermelondb';
import { text, date } from '@nozbe/watermelondb/decorators';

export default class ProfileBarbershop extends Model {
  static table = 'profile_barbershops';

  static associations = {
    profiles: { type: 'belongs_to', key: 'profile_id' },
    barbershops: { type: 'belongs_to', key: 'barbershop_id' },
  } as const;

  @text('profile_id') profileId!: string;
  @text('barbershop_id') barbershopId!: string;
  @text('role') role!: 'client' | 'barber' | 'admin';

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}

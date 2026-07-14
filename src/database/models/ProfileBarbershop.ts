import { Model } from '@nozbe/watermelondb';
import { text, date } from '@nozbe/watermelondb/decorators';

export default class ProfileEstablishment extends Model {
  static table = 'profile_establishments';

  static associations = {
    profiles: { type: 'belongs_to', key: 'profile_id' },
    establishments: { type: 'belongs_to', key: 'establishment_id' },
  } as const;

  @text('profile_id') profileId!: string;
  @text('establishment_id') establishmentId!: string;
  @text('role') role!: 'client' | 'professional' | 'admin';

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}

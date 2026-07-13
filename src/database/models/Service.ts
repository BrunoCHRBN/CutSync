import { Model } from '@nozbe/watermelondb';
import { field, text, date, relation } from '@nozbe/watermelondb/decorators';

export default class Service extends Model {
  static table = 'services';

  static associations = {
    barbershops: { type: 'belongs_to', key: 'barbershop_id' },
    appointments: { type: 'has_many', foreignKey: 'service_id' },
  } as const;

  @text('barbershop_id') barbershopId!: string;
  @text('name') name!: string;
  @field('price') price!: number;
  @field('duration_minutes') durationMinutes!: number;
  @field('is_active') isActive!: boolean;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('barbershops', 'barbershop_id') barbershop!: any;
}

import { Model } from '@nozbe/watermelondb';
import { text, date, children } from '@nozbe/watermelondb/decorators';

export default class Barbershop extends Model {
  static table = 'barbershops';

  static associations = {
    profiles: { type: 'has_many', foreignKey: 'barbershop_id' },
    services: { type: 'has_many', foreignKey: 'barbershop_id' },
    appointments: { type: 'has_many', foreignKey: 'barbershop_id' },
  } as const;

  @text('name') name!: string;
  @text('slug') slug!: string;
  @text('logo_url') logoUrl?: string;
  @text('primary_color') primaryColor!: string;
  
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('profiles') profiles!: any;
  @children('services') services!: any;
  @children('appointments') appointments!: any;
}

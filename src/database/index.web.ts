import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import schema from './schema';
import { models } from './models';

const adapter = new LokiJSAdapter({
  schema,
  useWebWorker: false,
  useIncrementalIndexedDB: true,
  extraLokiOptions: {
    autosave: false,
  },
  extraIncrementalIDBOptions: {
    onversionchange: () => {
      window.location.reload();
    },
  },
});

export const database = new Database({
  adapter,
  modelClasses: models,
});

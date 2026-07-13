import { Platform } from 'react-native';
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';

import schema from './schema';
import { models } from './models';

let adapter;

if (Platform.OS === 'web') {
  adapter = new LokiJSAdapter({
    schema,
    useWebWorker: false,
    useIncrementalIndexedDB: true,
  });
} else {
  adapter = new SQLiteAdapter({
    schema,
    dbName: 'CTRLShotDB',
  });
}

export const database = new Database({
  adapter,
  modelClasses: models,
});

import { MetaCalcDB } from '../db';

/** v3 → v4: add per-image tag assignments column on extradata. */
export function migrateV4() {
    MetaCalcDB.ensureColumn('tags', 'TEXT');
}

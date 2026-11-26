import fs from 'node:fs';
import path from 'node:path';
import { createInitialDb, makeId, type SunmedxDatabase } from './seed.ts';

export { createInitialDb, makeId, type SunmedxDatabase };

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'sunmedx-db.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDb(): SunmedxDatabase {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const seeded = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(seeded, null, 2), 'utf8');
    return seeded;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as SunmedxDatabase;
    return parsed;
  } catch {
    const seeded = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(seeded, null, 2), 'utf8');
    return seeded;
  }
}

export function saveDb(db: SunmedxDatabase): void {
  ensureDir();
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

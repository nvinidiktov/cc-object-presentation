import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── SQLite setup ────────────────────────────────────────────────────────────

const DB_PATH = path.join(DATA_DIR, 'app.db');
const sqlite = new Database(DB_PATH);

sqlite.pragma('journal_mode = WAL');    // concurrent reads + safe writes
sqlite.pragma('busy_timeout = 5000');   // wait up to 5s if DB is locked
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    name TEXT DEFAULT '',
    address TEXT DEFAULT '',
    metro TEXT DEFAULT '',
    price TEXT DEFAULT '',
    area TEXT DEFAULT '',
    floor TEXT DEFAULT '',
    finish TEXT DEFAULT '',
    delivery_date TEXT DEFAULT '',
    extra_fields TEXT DEFAULT '[]',
    advantages TEXT DEFAULT '[]',
    description TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_prop_user ON properties(user_id);
  CREATE INDEX IF NOT EXISTS idx_prop_updated ON properties(updated_at);

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'regular',
    order_index INTEGER NOT NULL DEFAULT 0,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_photo_prop ON photos(property_id);
`);

// ─── Auto-migrate from JSON (one-time) ──────────────────────────────────────

function migrateFromJson(): void {
  const count = (sqlite.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  if (count > 0) return; // already has data

  const PROP_FILE = path.join(DATA_DIR, 'properties.json');
  const PHOTO_FILE = path.join(DATA_DIR, 'photos.json');

  if (fs.existsSync(PROP_FILE)) {
    try {
      const props: any[] = JSON.parse(fs.readFileSync(PROP_FILE, 'utf-8'));
      const ins = sqlite.prepare(`
        INSERT OR IGNORE INTO properties
        (id, user_id, name, address, metro, price, area, floor, finish,
         delivery_date, extra_fields, advantages, description, created_at, updated_at)
        VALUES (@id, @user_id, @name, @address, @metro, @price, @area, @floor, @finish,
                @delivery_date, @extra_fields, @advantages, @description, @created_at, @updated_at)
      `);
      sqlite.transaction((list: any[]) => {
        for (const p of list) {
          const adv = Array.isArray(p.advantages) ? p.advantages : JSON.parse(p.advantages ?? '[]');
          ins.run({
            id: p.id,
            user_id: p.user_id ?? '',
            name: p.name ?? '',
            address: p.address ?? '',
            metro: p.metro ?? '',
            price: p.price ?? '',
            area: p.area ?? '',
            floor: p.floor ?? '',
            finish: p.finish ?? '',
            delivery_date: p.delivery_date ?? '',
            extra_fields: JSON.stringify(p.extra_fields ?? []),
            advantages: JSON.stringify(adv),
            description: p.description ?? '',
            created_at: p.created_at ?? Math.floor(Date.now() / 1000),
            updated_at: p.updated_at ?? Math.floor(Date.now() / 1000),
          });
        }
      })(props);
      console.log(`Migrated ${props.length} properties from JSON → SQLite`);
    } catch (err) {
      console.warn('JSON migration (properties) failed:', (err as Error).message);
    }
  }

  if (fs.existsSync(PHOTO_FILE)) {
    try {
      const photos: any[] = JSON.parse(fs.readFileSync(PHOTO_FILE, 'utf-8'));
      const ins = sqlite.prepare(`
        INSERT OR IGNORE INTO photos
        (id, property_id, filename, original_name, type, order_index, width, height, created_at)
        VALUES (@id, @property_id, @filename, @original_name, @type, @order_index, @width, @height, @created_at)
      `);
      sqlite.transaction((list: any[]) => {
        for (const p of list) {
          ins.run({
            id: p.id,
            property_id: p.property_id,
            filename: p.filename,
            original_name: p.original_name ?? '',
            type: p.type ?? 'regular',
            order_index: p.order_index ?? 0,
            width: p.width ?? 0,
            height: p.height ?? 0,
            created_at: p.created_at ?? Math.floor(Date.now() / 1000),
          });
        }
      })(photos);
      console.log(`Migrated ${photos.length} photos from JSON → SQLite`);
    } catch (err) {
      console.warn('JSON migration (photos) failed:', (err as Error).message);
    }
  }
}

migrateFromJson();

// ─── Prepared statements ────────────────────────────────────────────────────

const stmts = {
  allProps:       sqlite.prepare('SELECT * FROM properties ORDER BY updated_at DESC'),
  propsByUser:    sqlite.prepare('SELECT * FROM properties WHERE user_id = ? ORDER BY updated_at DESC'),
  propById:       sqlite.prepare('SELECT * FROM properties WHERE id = ?'),
  insertProp:     sqlite.prepare(`
    INSERT INTO properties (id, user_id, name, address, metro, price, area, floor, finish,
      delivery_date, extra_fields, advantages, description, created_at, updated_at)
    VALUES (@id, @user_id, @name, @address, @metro, @price, @area, @floor, @finish,
            @delivery_date, @extra_fields, @advantages, @description, @created_at, @updated_at)
  `),
  updateProp:     sqlite.prepare(`
    UPDATE properties SET name=@name, address=@address, metro=@metro, price=@price,
      area=@area, floor=@floor, finish=@finish, delivery_date=@delivery_date,
      extra_fields=@extra_fields, advantages=@advantages, description=@description,
      updated_at=@updated_at
    WHERE id=@id
  `),
  deleteProp:     sqlite.prepare('DELETE FROM properties WHERE id = ?'),

  photosByProp:   sqlite.prepare('SELECT * FROM photos WHERE property_id = ? ORDER BY order_index ASC'),
  photoById:      sqlite.prepare('SELECT * FROM photos WHERE id = ?'),
  insertPhoto:    sqlite.prepare(`
    INSERT INTO photos (id, property_id, filename, original_name, type, order_index, width, height, created_at)
    VALUES (@id, @property_id, @filename, @original_name, @type, @order_index, @width, @height, @created_at)
  `),
  deletePhoto:    sqlite.prepare('DELETE FROM photos WHERE id = ?'),
  deletePhotos:   sqlite.prepare('DELETE FROM photos WHERE property_id = ?'),
  reorderPhoto:   sqlite.prepare('UPDATE photos SET order_index = ? WHERE id = ?'),
  maxOrder:       sqlite.prepare('SELECT MAX(order_index) as m FROM photos WHERE property_id = ? AND type = ?'),
};

// Parse JSON fields stored as TEXT columns
function parseRow(row: any): any {
  if (!row) return null;
  return {
    ...row,
    extra_fields: typeof row.extra_fields === 'string' ? JSON.parse(row.extra_fields) : (row.extra_fields ?? []),
    advantages:   typeof row.advantages   === 'string' ? JSON.parse(row.advantages)   : (row.advantages ?? []),
  };
}

// ─── Public API (same interface as before) ──────────────────────────────────

export const db = {
  getProperties: (): any[] =>
    stmts.allProps.all().map(parseRow),

  getProperty: (id: string): any | null =>
    parseRow(stmts.propById.get(id)),

  insertProperty: (prop: any): any => {
    stmts.insertProp.run({
      ...prop,
      extra_fields: JSON.stringify(prop.extra_fields ?? []),
      advantages:   JSON.stringify(prop.advantages ?? []),
    });
    return parseRow(stmts.propById.get(prop.id));
  },

  updateProperty: (id: string, changes: any): any | null => {
    const existing = stmts.propById.get(id) as any;
    if (!existing) return null;
    const merged = {
      id,
      name:          changes.name          ?? existing.name,
      address:       changes.address       ?? existing.address,
      metro:         changes.metro         ?? existing.metro,
      price:         changes.price         ?? existing.price,
      area:          changes.area          ?? existing.area,
      floor:         changes.floor         ?? existing.floor,
      finish:        changes.finish        ?? existing.finish,
      delivery_date: changes.delivery_date ?? existing.delivery_date,
      extra_fields:  JSON.stringify(changes.extra_fields ?? JSON.parse(existing.extra_fields ?? '[]')),
      advantages:    JSON.stringify(changes.advantages   ?? JSON.parse(existing.advantages   ?? '[]')),
      description:   changes.description   ?? existing.description,
      updated_at:    changes.updated_at    ?? existing.updated_at,
    };
    stmts.updateProp.run(merged);
    return parseRow(stmts.propById.get(id));
  },

  deleteProperty: (id: string): boolean => {
    stmts.deletePhotos.run(id);
    stmts.deleteProp.run(id);
    return true;
  },

  getPhotos: (propertyId: string): any[] =>
    stmts.photosByProp.all(propertyId),

  getPhoto: (id: string): any | null =>
    stmts.photoById.get(id) ?? null,

  insertPhoto: (photo: any): any => {
    stmts.insertPhoto.run(photo);
    return stmts.photoById.get(photo.id);
  },

  deletePhoto: (id: string): any | null => {
    const photo = stmts.photoById.get(id) ?? null;
    if (!photo) return null;
    stmts.deletePhoto.run(id);
    return photo;
  },

  reorderPhotos: (items: { id: string; orderIndex: number }[]): void => {
    sqlite.transaction((list: { id: string; orderIndex: number }[]) => {
      for (const item of list) {
        stmts.reorderPhoto.run(item.orderIndex, item.id);
      }
    })(items);
  },

  maxPhotoOrder: (propertyId: string, type: string): number => {
    const row = stmts.maxOrder.get(propertyId, type) as any;
    return row?.m ?? -1;
  },
};

export default db;

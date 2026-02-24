import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PROPERTIES_FILE = path.join(DATA_DIR, 'properties.json');
const PHOTOS_FILE = path.join(DATA_DIR, 'photos.json');

function readFile<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return []; }
}

function writeFile<T>(filePath: string, data: T[]): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export const db = {
  getProperties: (): any[] =>
    readFile<any>(PROPERTIES_FILE).sort((a, b) => b.updated_at - a.updated_at),

  getProperty: (id: string): any | null =>
    readFile<any>(PROPERTIES_FILE).find(p => p.id === id) ?? null,

  insertProperty: (prop: any): any => {
    const list = readFile<any>(PROPERTIES_FILE);
    list.push(prop);
    writeFile(PROPERTIES_FILE, list);
    return prop;
  },

  updateProperty: (id: string, changes: any): any | null => {
    const list = readFile<any>(PROPERTIES_FILE);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...changes };
    writeFile(PROPERTIES_FILE, list);
    return list[idx];
  },

  deleteProperty: (id: string): boolean => {
    writeFile(PROPERTIES_FILE, readFile<any>(PROPERTIES_FILE).filter(p => p.id !== id));
    writeFile(PHOTOS_FILE, readFile<any>(PHOTOS_FILE).filter(p => p.property_id !== id));
    return true;
  },

  getPhotos: (propertyId: string): any[] =>
    readFile<any>(PHOTOS_FILE)
      .filter(p => p.property_id === propertyId)
      .sort((a, b) => a.order_index - b.order_index),

  getPhoto: (id: string): any | null =>
    readFile<any>(PHOTOS_FILE).find(p => p.id === id) ?? null,

  insertPhoto: (photo: any): any => {
    const list = readFile<any>(PHOTOS_FILE);
    list.push(photo);
    writeFile(PHOTOS_FILE, list);
    return photo;
  },

  deletePhoto: (id: string): any | null => {
    const list = readFile<any>(PHOTOS_FILE);
    const photo = list.find(p => p.id === id) ?? null;
    if (!photo) return null;
    writeFile(PHOTOS_FILE, list.filter(p => p.id !== id));
    return photo;
  },

  reorderPhotos: (items: { id: string; orderIndex: number }[]): void => {
    const list = readFile<any>(PHOTOS_FILE);
    for (const item of items) {
      const idx = list.findIndex((p: any) => p.id === item.id);
      if (idx !== -1) list[idx].order_index = item.orderIndex;
    }
    writeFile(PHOTOS_FILE, list);
  },

  maxPhotoOrder: (propertyId: string, type: string): number => {
    const photos = readFile<any>(PHOTOS_FILE)
      .filter((p: any) => p.property_id === propertyId && p.type === type);
    if (photos.length === 0) return -1;
    return Math.max(...photos.map((p: any) => p.order_index));
  },
};

export default db;

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { Property, PropertyCreate } from 'shared';

const router = Router();

function toProperty(row: any): Property {
  return {
    id: row.id,
    name: row.name ?? '',
    address: row.address ?? '',
    metro: row.metro ?? '',
    price: row.price ?? '',
    area: row.area ?? '',
    floor: row.floor ?? '',
    finish: row.finish ?? '',
    deliveryDate: row.delivery_date ?? '',
    extraFields: Array.isArray(row.extra_fields) ? row.extra_fields : [],
    advantages: Array.isArray(row.advantages) ? row.advantages : JSON.parse(row.advantages ?? '[]'),
    description: row.description ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', (_req: Request, res: Response) => {
  res.json({ data: db.getProperties().map(toProperty) });
});

router.post('/', (req: Request, res: Response) => {
  const body: PropertyCreate = req.body;
  const now = Math.floor(Date.now() / 1000);
  const prop = db.insertProperty({
    id: uuid(),
    name: body.name ?? '',
    address: body.address ?? '',
    metro: body.metro ?? '',
    price: body.price ?? '',
    area: body.area ?? '',
    floor: body.floor ?? '',
    finish: body.finish ?? '',
    delivery_date: body.deliveryDate ?? '',
    extra_fields: body.extraFields ?? [],
    advantages: body.advantages ?? [],
    description: body.description ?? '',
    created_at: now,
    updated_at: now,
  });
  res.status(201).json({ data: toProperty(prop) });
});

router.get('/:id', (req: Request, res: Response) => {
  const row = db.getProperty(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ data: toProperty(row) });
});

router.patch('/:id', (req: Request, res: Response) => {
  const existing = db.getProperty(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const body = req.body;
  const now = Math.floor(Date.now() / 1000);
  const updated = db.updateProperty(req.params.id, {
    name: body.name ?? existing.name,
    address: body.address ?? existing.address,
    metro: body.metro ?? existing.metro,
    price: body.price ?? existing.price,
    area: body.area ?? existing.area,
    floor: body.floor ?? existing.floor,
    finish: body.finish ?? existing.finish,
    delivery_date: body.deliveryDate ?? existing.delivery_date,
    extra_fields: body.extraFields !== undefined ? body.extraFields : (existing.extra_fields ?? []),
    advantages: body.advantages ?? existing.advantages,
    description: body.description ?? existing.description,
    updated_at: now,
  });
  res.json({ data: toProperty(updated) });
});

router.delete('/:id', (req: Request, res: Response) => {
  if (!db.getProperty(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.deleteProperty(req.params.id);
  res.json({ data: { deleted: true } });
});

export default router;

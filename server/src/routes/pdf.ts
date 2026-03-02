import { Router, Request, Response } from 'express';
import { db } from '../db';
import { buildLayout } from '../services/layoutEngine';
import { generatePdf } from '../services/pdfGenerator';
import { Property, Photo } from 'shared';
import path from 'path';
import fs from 'fs';

const router = Router({ mergeParams: true });

// Ownership check
router.use((req: Request, res: Response, next) => {
  const prop = db.getProperty(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const userId = (req as any).userId;
  if (prop.user_id && prop.user_id !== userId) return res.status(404).json({ error: 'Not found' });
  next();
});

function rowToProperty(row: any): Property {
  return {
    id: row.id,
    userId: row.user_id ?? '',
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

function rowToPhoto(row: any): Photo {
  return {
    id: row.id,
    propertyId: row.property_id,
    filename: row.filename,
    originalName: row.original_name,
    type: row.type,
    orderIndex: row.order_index,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

// ─── GET /properties/:id/layout  (preview layout without generating PDF) ──────

router.get('/layout', (req: Request, res: Response) => {
  const propRow = db.getProperty(req.params.id);
  if (!propRow) return res.status(404).json({ error: 'Not found' });

  const photoRows = db.getPhotos(req.params.id);

  const property = rowToProperty(propRow);
  const photos = photoRows.map(rowToPhoto);
  const layout = buildLayout(property, photos);

  res.json({ data: layout });
});

// ─── POST /properties/:id/pdf  (generate and download PDF) ───────────────────

router.post('/pdf', async (req: Request, res: Response) => {
  try {
    const propRow = db.getProperty(req.params.id);
    if (!propRow) return res.status(404).json({ error: 'Not found' });

    const photoRows = db.getPhotos(req.params.id);

    const property = rowToProperty(propRow);
    const photos = photoRows.map(rowToPhoto);

    // Если в запросе переданы слайды с кастомным порядком — используем их
    // Иначе генерируем авто-layout
    let slides = req.body?.slides;
    if (!slides || !Array.isArray(slides)) {
      const layout = buildLayout(property, photos);
      slides = layout.slides;
    }

    const pdfPath = await generatePdf(property, photos, slides);
    const filename = `${property.name || 'Презентация'}.pdf`
      .replace(/[^\w\s\u0400-\u04FF.-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    const stream = fs.createReadStream(pdfPath);
    stream.pipe(res);
    stream.on('close', () => {
      // Удаляем временный PDF после отправки
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      }, 5000);
    });
  } catch (err: any) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: err.message ?? 'Ошибка генерации PDF' });
  }
});

export default router;

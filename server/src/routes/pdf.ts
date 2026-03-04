import { Router, Request, Response } from 'express';
import { db } from '../db';
import { buildLayout } from '../services/layoutEngine';
import { generatePdf } from '../services/pdfGenerator';
import { Property, Photo } from 'shared';
import fs from 'fs';

const router = Router({ mergeParams: true });

// ─── PDF concurrency limiter (max 2 simultaneous) ───────────────────────────

const PDF_MAX_CONCURRENT = 2;
const PDF_QUEUE_TIMEOUT = 90_000; // 90s max wait in queue
let pdfRunning = 0;
const pdfQueue: Array<{ resolve: () => void; timer: ReturnType<typeof setTimeout> }> = [];

function acquirePdfSlot(): Promise<void> {
  if (pdfRunning < PDF_MAX_CONCURRENT) {
    pdfRunning++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = pdfQueue.findIndex(item => item.resolve === resolve);
      if (idx !== -1) pdfQueue.splice(idx, 1);
      reject(new Error('PDF queue timeout — server busy, try again later'));
    }, PDF_QUEUE_TIMEOUT);
    pdfQueue.push({ resolve: () => { clearTimeout(timer); pdfRunning++; resolve(); }, timer });
  });
}

function releasePdfSlot(): void {
  pdfRunning--;
  const next = pdfQueue.shift();
  if (next) next.resolve();
}

// ─── Simple per-user rate limit for PDF (1 request per 15s) ─────────────────

const pdfCooldowns = new Map<string, number>();
const PDF_COOLDOWN_MS = 15_000;

function checkPdfCooldown(userId: string): boolean {
  const last = pdfCooldowns.get(userId) ?? 0;
  if (Date.now() - last < PDF_COOLDOWN_MS) return false;
  pdfCooldowns.set(userId, Date.now());
  return true;
}

// ─── Ownership check ────────────────────────────────────────────────────────

router.use((req: Request, res: Response, next) => {
  const prop = db.getProperty(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  const userId = (req as any).userId;
  if (!prop.user_id || prop.user_id !== userId) return res.status(404).json({ error: 'Not found' });
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

// ─── GET /properties/:id/layout ─────────────────────────────────────────────

router.get('/layout', (req: Request, res: Response) => {
  const propRow = db.getProperty(req.params.id);
  if (!propRow) return res.status(404).json({ error: 'Not found' });
  const photos = db.getPhotos(req.params.id).map(rowToPhoto);
  res.json({ data: buildLayout(rowToProperty(propRow), photos) });
});

// ─── POST /properties/:id/pdf ───────────────────────────────────────────────

router.post('/pdf', async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;

  if (!checkPdfCooldown(userId)) {
    return res.status(429).json({ error: 'Too many requests — wait 15 seconds' });
  }

  try {
    await acquirePdfSlot();
  } catch {
    return res.status(503).json({ error: 'Server busy — try again later' });
  }

  try {
    const propRow = db.getProperty(req.params.id);
    if (!propRow) return res.status(404).json({ error: 'Not found' });

    const property = rowToProperty(propRow);
    const photos = db.getPhotos(req.params.id).map(rowToPhoto);

    let slides = req.body?.slides;
    if (!slides || !Array.isArray(slides)) {
      slides = buildLayout(property, photos).slides;
    }

    const pdfPath = await generatePdf(property, photos, slides);
    const filename = `${property.name || 'Презентация'}.pdf`
      .replace(/[^\w\s\u0400-\u04FF.-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    const stream = fs.createReadStream(pdfPath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).json({ error: 'PDF read failed' });
    });
    stream.pipe(res);
    res.on('finish', () => {
      setTimeout(() => {
        try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch {}
      }, 10_000);
    });
  } catch (err: any) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message ?? 'PDF generation failed' });
    }
  } finally {
    releasePdfSlot();
  }
});

export default router;

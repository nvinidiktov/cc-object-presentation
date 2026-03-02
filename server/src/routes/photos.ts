import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import path from 'path';
import { db } from '../db';
import { processImage, deleteImage, UPLOADS_PATH, TMP_PATH } from '../services/imageProcessor';
import { Photo, PhotoType } from 'shared';

const router = Router({ mergeParams: true });

// Ownership check: verify the property belongs to the requesting user
router.use((req: Request, res: Response, next) => {
  const prop = db.getProperty(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  const userId = (req as any).userId;
  if (prop.user_id && prop.user_id !== userId) return res.status(404).json({ error: 'Not found' });
  next();
});

const upload = multer({
  dest: TMP_PATH,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

function toPhoto(row: any): Photo {
  return {
    id: row.id,
    propertyId: row.property_id,
    filename: row.filename,
    originalName: row.original_name,
    type: row.type as PhotoType,
    orderIndex: row.order_index,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

router.get('/', (req: Request, res: Response) => {
  res.json({ data: db.getPhotos(req.params.id).map(toPhoto) });
});

router.post('/', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const propertyId = req.params.id;
    if (!db.getProperty(propertyId)) return res.status(404).json({ error: 'Property not found' });
    const photoType: PhotoType = (req.body.type as PhotoType) ?? 'regular';
    const processed = await processImage(req.file.path, req.file.originalname);
    const orderIndex = db.maxPhotoOrder(propertyId, photoType) + 1;
    const photo = db.insertPhoto({
      id: uuid(),
      property_id: propertyId,
      filename: processed.filename,
      original_name: req.file.originalname,
      type: photoType,
      order_index: orderIndex,
      width: processed.width,
      height: processed.height,
      created_at: Math.floor(Date.now() / 1000),
    });
    res.status(201).json({ data: toPhoto(photo) });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Upload error' });
  }
});

router.delete('/:photoId', (req: Request, res: Response) => {
  const photo = db.getPhoto(req.params.photoId);
  if (!photo || photo.property_id !== req.params.id) return res.status(404).json({ error: 'Not found' });
  deleteImage(photo.filename);
  db.deletePhoto(req.params.photoId);
  res.json({ data: { deleted: true } });
});

router.patch('/reorder', (req: Request, res: Response) => {
  const items: { id: string; orderIndex: number }[] = req.body.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items required' });
  db.reorderPhotos(items);
  res.json({ data: db.getPhotos(req.params.id).map(toPhoto) });
});

router.get('/file/:filename', (req: Request, res: Response) => {
  const filePath = path.join(UPLOADS_PATH, req.params.filename);
  res.sendFile(filePath, { headers: { 'Cache-Control': 'public, max-age=86400' } });
});

export default router;

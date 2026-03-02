import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
const TMP_DIR = path.join(UPLOADS_DIR, 'tmp');

// Создаём папки при старте сервера
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

export const UPLOADS_PATH = UPLOADS_DIR;
export const TMP_PATH = TMP_DIR;

export interface ProcessedImage {
  filename: string;
  width: number;
  height: number;
}

const MAX_W = 2400;
const MAX_H = 1600;

/**
 * Processes an uploaded image: resizes to max 2400x1600, saves as JPEG quality 85 (mozjpeg)
 * Uses sharp (native libvips + mozjpeg — fast & high-quality)
 */
export async function processImage(
  inputPath: string,
  _originalName: string
): Promise<ProcessedImage> {
  const filename = `${uuid()}.jpg`;
  const outputPath = path.join(UPLOADS_DIR, filename);

  const result = await sharp(inputPath)
    .resize(MAX_W, MAX_H, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(outputPath);

  // Remove multer temp file
  if (fs.existsSync(inputPath)) {
    try { fs.unlinkSync(inputPath); } catch (_) {}
  }

  return { filename, width: result.width, height: result.height };
}

/**
 * Deletes an image from the uploads folder
 */
export function deleteImage(filename: string): void {
  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}

/**
 * Returns absolute path to a photo file
 */
export function getImagePath(filename: string): string {
  return path.join(UPLOADS_DIR, filename);
}

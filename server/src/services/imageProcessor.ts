import Jimp from 'jimp';
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
 * Processes an uploaded image: resizes to max 2400x1600, saves as JPEG quality 87
 * Uses jimp@0.22 (pure JavaScript — no native compilation needed)
 */
export async function processImage(
  inputPath: string,
  _originalName: string
): Promise<ProcessedImage> {
  const filename = `${uuid()}.jpg`;
  const outputPath = path.join(UPLOADS_DIR, filename);

  const image = await Jimp.read(inputPath);

  // Scale down only if image exceeds max dimensions (never upscale)
  if (image.getWidth() > MAX_W || image.getHeight() > MAX_H) {
    image.scaleToFit(MAX_W, MAX_H); // jimp@0.22 API: two numbers, not an object
  }

  const width = image.getWidth();
  const height = image.getHeight();

  await image.quality(87).writeAsync(outputPath); // jimp@0.22 uses writeAsync

  // Remove multer temp file
  if (fs.existsSync(inputPath)) {
    try { fs.unlinkSync(inputPath); } catch (_) {}
  }

  return { filename, width, height };
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

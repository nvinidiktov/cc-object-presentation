import express from 'express';
import cors from 'cors';
import path from 'path';
import propertiesRouter from './routes/properties';
import photosRouter from './routes/photos';
import pdfRouter from './routes/pdf';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: IS_PROD ? true : 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Отдаём файлы uploads
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'data', 'uploads'), {
    maxAge: '1d',
  })
);

// ─── User identity from header ───────────────────────────────────────────────
app.use('/api', (req, _res, next) => {
  (req as any).userId = (req.headers['x-user-id'] as string) || '';
  next();
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/properties', propertiesRouter);
app.use('/api/properties/:id/photos', photosRouter);
app.use('/api/properties/:id', pdfRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── Production: serve built client ──────────────────────────────────────────
if (IS_PROD) {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist, { maxAge: '7d' }));
  // SPA fallback: все не-API роуты → index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
});

export default app;

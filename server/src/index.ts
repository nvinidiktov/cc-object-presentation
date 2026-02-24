import express from 'express';
import cors from 'cors';
import path from 'path';
import propertiesRouter from './routes/properties';
import photosRouter from './routes/photos';
import pdfRouter from './routes/pdf';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Отдаём файлы uploads
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'data', 'uploads'), {
    maxAge: '1d',
  })
);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/properties', propertiesRouter);
app.use('/api/properties/:id/photos', photosRouter);
app.use('/api/properties/:id', pdfRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

export default app;

import axios from 'axios';
import { Property, PropertyCreate, PropertyUpdate, Photo, PhotoType, LayoutResult } from 'shared';

const api = axios.create({ baseURL: '/api' });

// ─── Properties ───────────────────────────────────────────────────────────────

export const propertiesApi = {
  list: async (): Promise<Property[]> => {
    const { data } = await api.get('/properties');
    return data.data;
  },
  get: async (id: string): Promise<Property> => {
    const { data } = await api.get(`/properties/${id}`);
    return data.data;
  },
  create: async (payload: PropertyCreate): Promise<Property> => {
    const { data } = await api.post('/properties', payload);
    return data.data;
  },
  update: async (id: string, payload: PropertyUpdate): Promise<Property> => {
    const { data } = await api.patch(`/properties/${id}`, payload);
    return data.data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/properties/${id}`);
  },
};

// ─── Photos ───────────────────────────────────────────────────────────────────

export const photosApi = {
  list: async (propertyId: string): Promise<Photo[]> => {
    const { data } = await api.get(`/properties/${propertyId}/photos`);
    return data.data;
  },
  upload: async (
    propertyId: string,
    file: File,
    type: PhotoType = 'regular',
    onProgress?: (pct: number) => void
  ): Promise<Photo> => {
    const form = new FormData();
    form.append('photo', file);
    form.append('type', type);
    const { data } = await api.post(`/properties/${propertyId}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    });
    return data.data;
  },
  delete: async (propertyId: string, photoId: string): Promise<void> => {
    await api.delete(`/properties/${propertyId}/photos/${photoId}`);
  },
  reorder: async (
    propertyId: string,
    items: { id: string; orderIndex: number }[]
  ): Promise<Photo[]> => {
    const { data } = await api.patch(`/properties/${propertyId}/photos/reorder`, { items });
    return data.data;
  },
};

// ─── Layout + PDF ──────────────────────────────────────────────────────────────

export const pdfApi = {
  getLayout: async (propertyId: string): Promise<LayoutResult> => {
    const { data } = await api.get(`/properties/${propertyId}/layout`);
    return data.data;
  },
  generatePdf: async (propertyId: string, slides?: any[]): Promise<Blob> => {
    const { data } = await api.post(
      `/properties/${propertyId}/pdf`,
      slides ? { slides } : {},
      { responseType: 'blob' }
    );
    return data;
  },
};

// ─── Photo URL helper ─────────────────────────────────────────────────────────

export function photoUrl(filename: string): string {
  return `/uploads/${filename}`;
}

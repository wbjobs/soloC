import axios from 'axios';
import { Note, Composition } from '../types';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const generateAccompaniment = async (
  melody: Note[],
  style: string,
  title: string
): Promise<Composition> => {
  const response = await api.post('/generate', { melody, style, title });
  return response.data;
};

export const getCompositions = async (): Promise<Composition[]> => {
  const response = await api.get('/compositions');
  return response.data;
};

export const downloadMidi = async (
  compositionId: number,
  type: 'accompaniment' | 'melody' = 'accompaniment'
): Promise<void> => {
  const response = await api.get(`/compositions/${compositionId}/download`, {
    params: { type },
    responseType: 'blob',
  });
  
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `composition_${compositionId}_${type}.mid`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const deleteComposition = async (compositionId: number): Promise<void> => {
  await api.delete(`/compositions/${compositionId}`);
};

export default api;

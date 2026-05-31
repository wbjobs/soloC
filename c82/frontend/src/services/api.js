import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const urlApi = {
  getAll: () => api.get('/urls'),
  getById: (id) => api.get(`/urls/${id}`),
  create: (data) => api.post('/urls', data),
  update: (id, data) => api.put(`/urls/${id}`, data),
  delete: (id) => api.delete(`/urls/${id}`),
  crawl: (id) => api.post(`/urls/${id}/crawl`),
  getSnapshots: (id, limit = 50) => api.get(`/urls/${id}/snapshots?limit=${limit}`),
  getDiffs: (id, limit = 50) => api.get(`/urls/${id}/diffs?limit=${limit}`),
  getStats: (id) => api.get(`/urls/${id}/stats`),
};

export const snapshotApi = {
  getById: (id) => api.get(`/snapshots/${id}`),
  getContent: (id) => api.get(`/snapshots/${id}/content`),
};

export const diffApi = {
  getById: (id) => api.get(`/diffs/${id}`),
  getData: (id) => api.get(`/diffs/${id}/data`),
  compare: (snapshot1Id, snapshot2Id) => api.post('/diffs/compare', { snapshot1Id, snapshot2Id }),
};

export const webhookApi = {
  getByUrlId: (urlId) => api.get(`/webhooks/url/${urlId}`),
  getById: (id) => api.get(`/webhooks/${id}`),
  getLogs: (id, limit = 50) => api.get(`/webhooks/${id}/logs?limit=${limit}`),
  create: (data) => api.post('/webhooks', data),
  update: (id, data) => api.put(`/webhooks/${id}`, data),
  delete: (id) => api.delete(`/webhooks/${id}`),
  test: (id) => api.post(`/webhooks/${id}/test`),
};

export default api;

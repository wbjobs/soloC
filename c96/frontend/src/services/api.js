import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.response.use(
  response => response,
  error => {
    console.error('API请求错误:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const floorPlanApi = {
  getAll: () => api.get('/floorplans'),
  getById: (id) => api.get(`/floorplans/${id}`),
  getStats: (id) => api.get(`/floorplans/${id}/stats`),
  upload: (formData) => api.post('/floorplans', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  delete: (id) => api.delete(`/floorplans/${id}`)
};

export const lightingConfigApi = {
  getAll: (floorPlanId) => {
    const params = floorPlanId ? { params: { floorPlanId } } : {};
    return api.get('/lighting-configs', params);
  },
  getByFloorPlan: (floorPlanId) => api.get(`/lighting-configs/floorplan/${floorPlanId}`),
  getById: (id) => api.get(`/lighting-configs/${id}`),
  create: (data) => {
    console.log('创建光照配置，发送数据:', JSON.stringify(data, null, 2));
    return api.post('/lighting-configs', data);
  },
  update: (id, data) => api.put(`/lighting-configs/${id}`, data),
  delete: (id) => api.delete(`/lighting-configs/${id}`)
};

export const renderTaskApi = {
  getAll: () => api.get('/render-tasks'),
  getById: (id) => api.get(`/render-tasks/${id}`),
  create: (data) => api.post('/render-tasks', data),
  update: (id, data) => api.put(`/render-tasks/${id}`, data),
  delete: (id) => api.delete(`/render-tasks/${id}`)
};

export default api;

import request from '@/utils/request';
import type { LoginResponse, Form, FormComponent, Submission } from '@/types';

export const authApi = {
  login: (username: string, password: string) =>
    request.post<LoginResponse>('/auth/login', { username, password }),
  register: (username: string, password: string, role?: string) =>
    request.post('/auth/register', { username, password, role }),
  profile: () => request.get('/auth/profile'),
};

export const formsApi = {
  list: () => request.get<Form[]>('/forms'),
  get: (id: string) => request.get<Form>(`/forms/${id}`),
  create: (data: { name: string; description: string; components: FormComponent[] }) =>
    request.post<Form>('/forms', data),
  update: (id: string, data: Partial<Form>) =>
    request.patch<Form>(`/forms/${id}`, data),
  delete: (id: string) => request.delete(`/forms/${id}`),
};

export const submissionsApi = {
  list: (formId: string) => request.get<Submission[]>(`/submissions/form/${formId}`),
  get: (id: string, formId: string) =>
    request.get<Submission>(`/submissions/${id}/form/${formId}`),
  create: (formId: string, data: Record<string, any>) =>
    request.post<Submission>(`/submissions/${formId}`, data),
  export: (formId: string) =>
    request.get(`/submissions/export/${formId}`, {
      responseType: 'blob',
    }),
};

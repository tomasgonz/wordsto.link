import { useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Dynamically determine API URL based on current hostname
const API_BASE_URL = typeof window !== 'undefined' 
  ? `http://${window.location.hostname}:3000/api`
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add authorization header if token exists in localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function useApiClient() {
  return api;
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface CreateUrlData {
  identifier?: string | null;
  keywords: string[];
  destination_url: string;
  title?: string | null;
  description?: string | null;
  expires_at?: string | null;
}

export interface UpdateUrlData {
  keywords?: string[];
  destination_url?: string;
  title?: string | null;
  description?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
}

export interface UrlsParams {
  page?: number;
  limit?: number;
  search?: string;
  identifier?: string;
  sort_by?: 'created_at' | 'click_count' | 'last_clicked_at' | 'title';
  order?: 'asc' | 'desc';
  is_active?: boolean;
  has_expired?: boolean;
}

export function useUrls(params: UrlsParams = {}) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)])
  ).toString();

  return useQuery({
    queryKey: ['urls', queryString],
    queryFn: async () => {
      const response = await api.get(`/urls?${queryString}`);
      return response.data;
    },
  });
}

export function useUrl(id: string) {
  return useQuery({
    queryKey: ['url', id],
    queryFn: async () => {
      const response = await api.get(`/urls/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateUrl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUrlData) => {
      const response = await api.post('/shorten', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['urls'] });
      toast.success('URL created successfully!');
    },
    onError: (error: AxiosError<any>) => {
      toast.error(error.response?.data?.message || 'Failed to create URL');
    },
  });
}

export function useUpdateUrl(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateUrlData) => {
      const response = await api.patch(`/urls/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['urls'] });
      queryClient.invalidateQueries({ queryKey: ['url', id] });
      toast.success('URL updated successfully!');
    },
    onError: (error: AxiosError<any>) => {
      toast.error(error.response?.data?.message || 'Failed to update URL');
    },
  });
}

export function useDeleteUrl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, permanent }: { id: string; permanent?: boolean }) => {
      const response = await api.delete(`/urls/${id}?permanent=${permanent || false}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['urls'] });
      toast.success('URL deleted successfully!');
    },
    onError: (error: AxiosError<any>) => {
      toast.error(error.response?.data?.message || 'Failed to delete URL');
    },
  });
}

export function useAnalytics(path: string, period: string = '30d') {
  return useQuery({
    queryKey: ['analytics', path, period],
    queryFn: async () => {
      const response = await api.get(`/analytics/${path}?period=${period}`);
      return response.data;
    },
    enabled: !!path,
  });
}

export function useAnalyticsSummary(period: string = '30d') {
  return useQuery({
    queryKey: ['analytics-summary', period],
    queryFn: async () => {
      const response = await api.get(`/analytics/summary?period=${period}`);
      return response.data;
    },
  });
}

export function useBulkCreateUrls() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (urls: CreateUrlData[]) => {
      const response = await api.post('/shorten/bulk', { urls });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['urls'] });
      toast.success(`Successfully created ${data.successful} URLs`);
      if (data.failed > 0) {
        toast.warning(`Failed to create ${data.failed} URLs`);
      }
    },
    onError: (error: AxiosError<any>) => {
      toast.error(error.response?.data?.message || 'Bulk creation failed');
    },
  });
}

export function useExportAnalytics(format: 'json' | 'csv' = 'json') {
  return useMutation({
    mutationFn: async (params: { period?: string; include_analytics?: boolean }) => {
      const response = await api.get('/analytics/export', {
        params: { format, ...params },
        responseType: format === 'csv' ? 'blob' : 'json',
      });
      
      if (format === 'csv') {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `analytics-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      
      return response.data;
    },
    onSuccess: () => {
      toast.success('Export completed successfully!');
    },
    onError: (error: AxiosError<any>) => {
      toast.error(error.response?.data?.message || 'Export failed');
    },
  });
}

export function useApiHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await api.get('/health');
      return response.data;
    },
    refetchInterval: 30000,
  });
}
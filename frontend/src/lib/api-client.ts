import { getApiUrl } from './config';

interface FetchOptions extends RequestInit {
  token?: string | null;
}

export async function apiClient(endpoint: string, options: FetchOptions = {}) {
  const { token, ...fetchOptions } = options;

  const url = getApiUrl(endpoint);
  console.log('Making API request to:', url);

  const config: RequestInit = {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...fetchOptions.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`API Error (${response.status}):`, errorBody);
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    console.error('API Client Error:', error);

    // Check if it's a network error
    if (error instanceof TypeError && error.message === 'Load failed') {
      console.error('Network error - possibly CORS or connectivity issue');
      return {
        data: null,
        error: 'Network error: Unable to connect to the server. Please check your connection and try again.'
      };
    }

    return {
      data: null,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}
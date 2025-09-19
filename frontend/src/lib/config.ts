// Use relative URLs so Next.js can proxy to the backend
// This avoids CORS issues and makes the app work regardless of the access URL
const getBaseUrl = () => {
  // For client-side requests, use relative URLs (will be proxied by Next.js)
  if (typeof window !== 'undefined') {
    return '';
  }

  // For server-side rendering, we still need the full URL
  // But this should rarely be used since most API calls are client-side
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, '');

  return 'http://localhost:8080';
};

export const API_URL = getBaseUrl();

export const getApiUrl = (path: string) => {
  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // If baseUrl is empty (client-side), return just the path
  if (!baseUrl) {
    return cleanPath;
  }

  // Otherwise, combine baseUrl and path
  return `${baseUrl}${cleanPath}`;
};

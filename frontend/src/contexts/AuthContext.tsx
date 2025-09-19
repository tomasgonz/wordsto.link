'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  name: string;
  identifier: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, identifier: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  // Use relative URLs - Next.js will proxy to the backend
  const apiBase = '/api';

  useEffect(() => {
    // Check for stored session
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        localStorage.removeItem('user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const url = `${apiBase}/auth/login`;
      console.log('Attempting login to:', url);
      console.log('With credentials:', { email, password: '***' });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      console.log('Response status:', response.status);
      console.log('Response data:', data);

      if (!response.ok) {
        console.error('Login failed:', data);
        throw new Error(data.message || 'Login failed');
      }

      // Store token and user data
      localStorage.setItem('token', data.token);
      
      const userData: User = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.full_name || data.user.name,
        identifier: data.user.identifier,
        createdAt: data.user.created_at || new Date().toISOString()
      };
      
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      toast.success('Logged in successfully!');
      router.push('/dashboard');
    } catch (error: any) {
      const isNetworkError = error instanceof TypeError;
      if (isNetworkError) {
        toast.error(`Network error contacting API at ${apiBase}. Check URL/CORS.`);
      } else {
        toast.error(error.message || 'Invalid email or password');
      }
      throw error;
    }
  };

  const signup = async (email: string, password: string, name: string, identifier: string) => {
    try {
      const url = `${apiBase}/auth/signup`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email, 
          password, 
          full_name: name,
          identifier 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Signup failed');
      }

      // Store token but don't set user as logged in yet (need email verification)
      localStorage.setItem('token', data.token);
      localStorage.setItem('pendingVerification', 'true');
      localStorage.setItem('pendingEmail', email);
      
      toast.success('Account created! Please check your email to verify your account.');
      router.push('/verify-email-sent');
    } catch (error: any) {
      const isNetworkError = error instanceof TypeError;
      if (isNetworkError) {
        toast.error(`Network error contacting API at ${apiBase}. Check URL/CORS.`);
      } else {
        toast.error(error.message || 'Failed to create account');
      }
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    toast.success('Logged out successfully');
    router.push('/');
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      login,
      signup,
      logout,
      updateUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

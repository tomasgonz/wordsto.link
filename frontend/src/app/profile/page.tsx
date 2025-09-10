'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Mail, 
  Link, 
  Calendar, 
  Shield, 
  Settings,
  CreditCard,
  LogOut,
  Trash2,
  Plus,
  X,
  Check,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [newIdentifier, setNewIdentifier] = useState('');
  const [isAddingIdentifier, setIsAddingIdentifier] = useState(false);
  const [subscription, setSubscription] = useState({
    tier: 'free',
    maxUrls: 10,
    maxIdentifiers: 1,
    expiresAt: null
  });

  const handleAddIdentifier = async () => {
    if (!newIdentifier) return;

    try {
      const response = await fetch('/api/user/identifiers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier: newIdentifier })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      setIdentifiers([...identifiers, newIdentifier]);
      setNewIdentifier('');
      setIsAddingIdentifier(false);
      toast.success('Identifier claimed successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to claim identifier');
    }
  };

  const handleReleaseIdentifier = async (identifier: string) => {
    if (!confirm(`Are you sure you want to release "${identifier}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/user/identifiers/${identifier}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      setIdentifiers(identifiers.filter(id => id !== identifier));
      toast.success('Identifier released successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to release identifier');
    }
  };

  const handleSignOut = () => {
    logout();
  };

  useEffect(() => {
    // Load user's identifier if they have one
    if (user?.identifier) {
      setIdentifiers([user.identifier]);
    }
  }, [user]);

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please sign in to view your profile</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Profile Settings</h1>

      <div className="space-y-6">
        {/* User Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">User Information</h2>
          
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center">
              <User className="w-10 h-10 text-primary-600" />
            </div>
            
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2 text-gray-700">
                <User className="w-4 h-4 text-gray-400" />
                <span className="font-medium">{user.name || 'Not set'}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-700">
                <Mail className="w-4 h-4 text-gray-400" />
                <span>{user.email}</span>
                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                  Verified
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-700">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>Joined {format(new Date(user.createdAt), 'MMMM yyyy')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Subscription</h2>
            <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              Upgrade Plan
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">Current Plan</span>
              </div>
              <p className="text-xl font-semibold text-gray-900 capitalize">
                {subscription.tier}
              </p>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Link className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">URL Limit</span>
              </div>
              <p className="text-xl font-semibold text-gray-900">
                {subscription.maxUrls === -1 ? 'Unlimited' : subscription.maxUrls}
              </p>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">Identifiers</span>
              </div>
              <p className="text-xl font-semibold text-gray-900">
                {subscription.maxIdentifiers === -1 ? 'Unlimited' : subscription.maxIdentifiers}
              </p>
            </div>
          </div>
        </div>

        {/* Identifiers */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Your Identifiers</h2>
            {identifiers.length < subscription.maxIdentifiers && (
              <button
                onClick={() => setIsAddingIdentifier(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                <Plus className="w-4 h-4" />
                Claim Identifier
              </button>
            )}
          </div>
          
          {isAddingIdentifier && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Identifier
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newIdentifier}
                  onChange={(e) => setNewIdentifier(e.target.value.toLowerCase())}
                  placeholder="mycompany"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  onClick={handleAddIdentifier}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <Check className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    setIsAddingIdentifier(false);
                    setNewIdentifier('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                2-20 characters, lowercase letters, numbers, hyphens, and underscores only
              </p>
            </div>
          )}
          
          {identifiers.length === 0 ? (
            <div className="text-center py-8">
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No identifiers claimed yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Claim an identifier to create branded short URLs
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {identifiers.map((identifier) => (
                <div
                  key={identifier}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-gray-400" />
                    <code className="font-mono text-sm text-gray-900">
                      wordsto.link/{identifier}/*
                    </code>
                  </div>
                  <button
                    onClick={() => handleReleaseIdentifier(identifier)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Release identifier"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {identifiers.length >= subscription.maxIdentifiers && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Identifier limit reached</p>
                  <p className="mt-1">
                    Upgrade your plan to claim more identifiers or release existing ones.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-4">Danger Zone</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Sign out</p>
                <p className="text-sm text-gray-600">Sign out of your account on this device</p>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Delete account</p>
                <p className="text-sm text-gray-600">Permanently delete your account and all data</p>
              </div>
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                <Trash2 className="w-4 h-4" />
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
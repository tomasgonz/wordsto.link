'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getApiUrl } from '@/lib/config';
import { apiClient } from '@/lib/api-client';
import { 
  User, Mail, Link2, Shield, Bell, 
  Check, X, Info, Edit2, Save, AlertCircle
} from 'lucide-react';

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Profile form data
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    identifier: user?.identifier || ''
  });
  
  // Identifier change states
  const [newIdentifier, setNewIdentifier] = useState('');
  const [checkingIdentifier, setCheckingIdentifier] = useState(false);
  const [identifierAvailable, setIdentifierAvailable] = useState<boolean | null>(null);
  const [identifierError, setIdentifierError] = useState('');
  
  // Notification preferences
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    weeklyReport: false,
    marketingEmails: false
  });

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name,
        email: user.email,
        identifier: user.identifier
      });
      setNewIdentifier(user.identifier);
    }
  }, [user]);

  // Check identifier availability when it changes
  useEffect(() => {
    if (!newIdentifier || newIdentifier === user?.identifier) {
      setIdentifierAvailable(null);
      setIdentifierError('');
      return;
    }

    // Validate identifier format
    if (!/^[a-z0-9-]+$/.test(newIdentifier)) {
      setIdentifierError('Only lowercase letters, numbers, and hyphens allowed');
      setIdentifierAvailable(false);
      return;
    }

    if (newIdentifier.length < 3) {
      setIdentifierError('Identifier must be at least 3 characters');
      setIdentifierAvailable(false);
      return;
    }

    if (newIdentifier.length > 20) {
      setIdentifierError('Identifier must be 20 characters or less');
      setIdentifierAvailable(false);
      return;
    }

    setIdentifierError('');
    const timer = setTimeout(() => {
      checkIdentifierAvailability();
    }, 500);

    return () => clearTimeout(timer);
  }, [newIdentifier, user?.identifier]);

  const checkIdentifierAvailability = async () => {
    setCheckingIdentifier(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(getApiUrl(`api/user/identifiers/check/${newIdentifier}`), {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      setIdentifierAvailable(data.is_available);
      setCheckingIdentifier(false);

      if (!data.is_available) {
        setIdentifierError('This identifier is already taken');
      }
    } catch (error) {
      console.error('Failed to check identifier availability:', error);
      setCheckingIdentifier(false);
      setIdentifierError('Failed to check availability. Please try again.');
      setIdentifierAvailable(false);
    }
  };

  const handleIdentifierChange = (value: string) => {
    // Only allow lowercase letters, numbers, and hyphens
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setNewIdentifier(cleaned);
  };

  const handleSaveProfile = async () => {
    if (!profileData.name || !profileData.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (newIdentifier !== user?.identifier) {
      if (!identifierAvailable) {
        toast.error('Please choose an available identifier');
        return;
      }
    }

    setIsSaving(true);

    try {
      const updateData: any = {
        full_name: profileData.name,
        email: profileData.email
      };

      // Only include identifier if it's different from the current one
      if (newIdentifier !== user?.identifier) {
        updateData.identifier = newIdentifier;
      }

      const token = localStorage.getItem('token');
      const { data: updatedUser, error } = await apiClient('api/user/profile', {
        method: 'PATCH',
        token,
        body: JSON.stringify(updateData)
      });

      if (error) {
        throw new Error(error);
      }

      // Update user context
      updateUser({
        ...user!,
        name: updatedUser.full_name,
        email: updatedUser.email,
        identifier: updatedUser.identifier
      });

      toast.success('Profile updated successfully!');
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setIsSaving(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Notification preferences saved!');
    } catch (error) {
      toast.error('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'identifier', label: 'Identifier', icon: Link2 },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>
        
        <div className="bg-white rounded-lg shadow">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors ${
                      activeTab === tab.id
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-2" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center text-sm text-primary-600 hover:text-primary-700"
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setProfileData({
                            name: user?.name || '',
                            email: user?.email || '',
                            identifier: user?.identifier || ''
                          });
                        }}
                        className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        className="flex items-center px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex">
                    <Info className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium">Account created</p>
                      <p>{user ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'identifier' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Identifier</h2>
                  <p className="text-sm text-gray-600 mb-6">
                    Your identifier is used in all your shortened URLs. Choose carefully as changing it will affect all existing links.
                  </p>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                    <div className="flex">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0" />
                      <div className="text-sm text-yellow-800">
                        <p className="font-medium mb-1">Important</p>
                        <p>Changing your identifier will update all your existing URLs. Old links will redirect to the new ones automatically.</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Identifier
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                        wordsto.link/
                      </div>
                      <input
                        type="text"
                        value={newIdentifier}
                        onChange={(e) => handleIdentifierChange(e.target.value)}
                        disabled={!isEditing}
                        className={`w-full pl-[120px] pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500 ${
                          identifierAvailable === true ? 'border-green-500' : 
                          identifierAvailable === false ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        {checkingIdentifier && (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
                        )}
                        {!checkingIdentifier && identifierAvailable === true && newIdentifier !== user?.identifier && (
                          <Check className="h-5 w-5 text-green-500" />
                        )}
                        {!checkingIdentifier && identifierAvailable === false && (
                          <X className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                    </div>
                    {identifierError && (
                      <p className="mt-1 text-sm text-red-600">{identifierError}</p>
                    )}
                    {identifierAvailable === true && newIdentifier !== user?.identifier && (
                      <p className="mt-1 text-sm text-green-600">This identifier is available!</p>
                    )}
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Your URLs will look like:</h3>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <code className="text-sm text-gray-600">
                        wordsto.link/{newIdentifier || 'identifier'}/keyword
                      </code>
                    </div>
                  </div>

                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                      Change Identifier
                    </button>
                  ) : (
                    <div className="mt-6 flex gap-3">
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setNewIdentifier(user?.identifier || '');
                          setIdentifierAvailable(null);
                          setIdentifierError('');
                        }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveProfile}
                        disabled={isSaving || (newIdentifier !== user?.identifier && !identifierAvailable)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-gray-900">Email Alerts</p>
                      <p className="text-sm text-gray-500">Get notified about important account activity</p>
                    </div>
                    <button
                      onClick={() => setNotifications({ ...notifications, emailAlerts: !notifications.emailAlerts })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        notifications.emailAlerts ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          notifications.emailAlerts ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-gray-900">Weekly Report</p>
                      <p className="text-sm text-gray-500">Receive weekly analytics summary</p>
                    </div>
                    <button
                      onClick={() => setNotifications({ ...notifications, weeklyReport: !notifications.weeklyReport })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        notifications.weeklyReport ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          notifications.weeklyReport ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-gray-900">Marketing Emails</p>
                      <p className="text-sm text-gray-500">Receive tips and product updates</p>
                    </div>
                    <button
                      onClick={() => setNotifications({ ...notifications, marketingEmails: !notifications.marketingEmails })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        notifications.marketingEmails ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          notifications.marketingEmails ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveNotifications}
                  disabled={isSaving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Security Settings</h2>
                
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Change Password</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Password
                      </label>
                      <input
                        type="password"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                      Update Password
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t">
                  <h3 className="font-medium text-gray-900 mb-3">Two-Factor Authentication</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Add an extra layer of security to your account
                  </p>
                  <button className="px-4 py-2 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50">
                    Enable 2FA
                  </button>
                </div>

                <div className="pt-6 border-t">
                  <h3 className="font-medium text-red-600 mb-3">Danger Zone</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Once you delete your account, there is no going back. Please be certain.
                  </p>
                  <button className="px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50">
                    Delete Account
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
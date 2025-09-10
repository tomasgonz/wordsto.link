'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  Link2, Copy, Check, Info, Plus, X 
} from 'lucide-react';

export default function CreatePage() {
  const router = useRouter();
  const { user } = useAuth();
  const userIdentifier = user?.identifier || '';
  
  const [formData, setFormData] = useState({
    keywords: [''],
    originalUrl: '',
    title: '',
    description: '',
    expiresAt: '',
    isActive: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleKeywordChange = (index: number, value: string) => {
    const newKeywords = [...formData.keywords];
    newKeywords[index] = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setFormData({ ...formData, keywords: newKeywords });
  };

  const addKeyword = () => {
    if (formData.keywords.length < 5) {
      setFormData({ ...formData, keywords: [...formData.keywords, ''] });
    }
  };

  const removeKeyword = (index: number) => {
    if (formData.keywords.length > 1) {
      const newKeywords = formData.keywords.filter((_, i) => i !== index);
      setFormData({ ...formData, keywords: newKeywords });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter out empty keywords
    const validKeywords = formData.keywords.filter(k => k.trim() !== '');
    
    if (validKeywords.length === 0) {
      toast.error('Please provide at least one keyword');
      return;
    }

    if (!formData.originalUrl) {
      toast.error('Please provide the destination URL');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Dynamically determine API URL based on current hostname
      const apiUrl = typeof window !== 'undefined' 
        ? `http://${window.location.hostname}:3000/api`
        : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api');
      
      const response = await fetch(`${apiUrl}/shorten`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          destination_url: formData.originalUrl,
          title: formData.title,
          description: formData.description,
          expires_at: formData.expiresAt || null,
          is_active: formData.isActive,
          identifier: userIdentifier,
          keywords: validKeywords,
          userId: user?.id || ''
        })
      });

      // 201 Created is a success status
      if (response.status !== 200 && response.status !== 201) {
        let errorMessage = `Failed to create URL: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // If parsing JSON fails, try text
          const errorText = await response.text();
          if (errorText) {
            console.error('Response error:', response.status, errorText);
          }
        }
        
        // Check for duplicate URL
        if (response.status === 409) {
          toast.error('A URL with these keywords already exists. Try different keywords.');
        } else {
          toast.error(errorMessage);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const shortUrl = `https://wordsto.link/${userIdentifier}/${validKeywords.join('/')}`;
      setCreatedUrl(shortUrl);
      toast.success('Short URL created successfully!');
    } catch (error) {
      // Error toast is already shown above, just log it
      console.error('Error creating URL:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (createdUrl) {
      navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setFormData({
      keywords: [''],
      originalUrl: '',
      title: '',
      description: '',
      expiresAt: '',
      isActive: true
    });
    setCreatedUrl(null);
  };

  if (createdUrl) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Short URL Created!
            </h2>
            
            <p className="text-gray-600 mb-6">
              Your shortened URL is ready to use
            </p>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <code className="text-sm text-primary-600 font-mono">
                  {createdUrl}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="ml-4 p-2 text-gray-500 hover:text-primary-600 transition-colors"
                >
                  {copied ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
            
            <div className="flex gap-4 justify-center">
              <button
                onClick={resetForm}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Create Another
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="flex items-center mb-6">
            <Link2 className="w-8 h-8 text-primary-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">
              Create Short URL
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                Your URLs will be created under: <span className="font-mono font-medium">wordsto.link/{userIdentifier}/</span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Keywords
              </label>
              <div className="space-y-2">
                {formData.keywords.map((keyword, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => handleKeywordChange(index, e.target.value)}
                      placeholder={`Keyword ${index + 1}`}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      required={index === 0}
                    />
                    {formData.keywords.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeKeyword(index)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {formData.keywords.length < 5 && (
                <button
                  type="button"
                  onClick={addKeyword}
                  className="mt-2 flex items-center text-sm text-primary-600 hover:text-primary-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add another keyword
                </button>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Creates URLs like: wordsto.link/{userIdentifier}/{formData.keywords.filter(k => k).join('/') || 'keyword'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Destination URL
              </label>
              <input
                type="url"
                value={formData.originalUrl}
                onChange={(e) => setFormData({ ...formData, originalUrl: e.target.value })}
                placeholder="https://example.com/very-long-url"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title (Optional)
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="My Portfolio"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="A brief description of where this link goes..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expiration Date (Optional)
              </label>
              <input
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                Activate immediately
              </label>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Creating...' : 'Create Short URL'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <div className="flex">
            <Info className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">How it works:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>All your URLs are under your identifier: /{userIdentifier}/</li>
                <li>Keywords create your URL path: /{userIdentifier}/keyword1/keyword2</li>
                <li>Multiple keywords support: up to 5 levels deep</li>
                <li>All URLs are tracked with detailed analytics</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
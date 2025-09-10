'use client';

import { useState } from 'react';
import { CreateUrlForm } from '@/components/forms/CreateUrlForm';
import { UrlList } from '@/components/dashboard/UrlList';
import { useUrls, useDeleteUrl, useUpdateUrl } from '@/hooks/useApi';
import { 
  Plus, 
  Search, 
  Filter, 
  Download, 
  TrendingUp,
  Link,
  Link2,
  Users,
  MousePointer
} from 'lucide-react';

export default function DashboardPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'created_at' | 'click_count'>('created_at');
  
  const { data, isLoading, refetch } = useUrls({
    page: currentPage,
    limit: 20,
    search: searchTerm || undefined,
    sort_by: sortBy,
    order: 'desc'
  });

  const deleteUrl = useDeleteUrl();
  const updateUrl = useUpdateUrl('');

  const handleDelete = async (url: any) => {
    if (confirm('Are you sure you want to delete this URL?')) {
      await deleteUrl.mutateAsync({ id: url.id });
    }
  };

  const handleToggleActive = async (url: any) => {
    await updateUrl.mutateAsync({ 
      id: url.id, 
      data: { is_active: !url.is_active } 
    });
  };

  const handleCreateSuccess = () => {
    setShowCreateForm(false);
    refetch();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Manage your shortened URLs and view analytics</p>
      </div>

      {data?.stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total URLs</span>
              <Link className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.stats.total_urls}
            </div>
            <div className="mt-2 flex items-center text-sm text-green-600">
              <TrendingUp className="w-4 h-4 mr-1" />
              {data.stats.urls_created_this_month} this month
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Clicks</span>
              <MousePointer className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.stats.total_clicks.toLocaleString()}
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {data.stats.urls_clicked_today} URLs clicked today
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Unique Visitors</span>
              <Users className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.stats.total_unique_visitors.toLocaleString()}
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Active URLs</span>
              <TrendingUp className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.stats.active_urls}
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {data.stats.inactive_urls} inactive
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search URLs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="created_at">Newest First</option>
                <option value="click_count">Most Clicked</option>
              </select>

              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Filter className="w-5 h-5" />
              </button>

              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Download className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create URL
              </button>
            </div>
          </div>
        </div>

        {showCreateForm && (
          <div className="p-6 bg-gray-50 border-b border-gray-200">
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Short URL</h2>
              <CreateUrlForm onSuccess={handleCreateSuccess} />
            </div>
          </div>
        )}

        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading URLs...</p>
            </div>
          ) : data?.urls?.length === 0 ? (
            <div className="text-center py-12">
              <Link2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No URLs yet</h3>
              <p className="text-gray-600 mb-4">Create your first short URL to get started</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create your first URL
              </button>
            </div>
          ) : (
            <>
              <UrlList
                urls={data?.urls || []}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
              />

              {data?.pagination && data.pagination.total_pages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {((currentPage - 1) * 20) + 1} to {Math.min(currentPage * 20, data.pagination.total)} of {data.pagination.total} results
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={!data.pagination.has_prev}
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm">
                      Page {currentPage} of {data.pagination.total_pages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={!data.pagination.has_next}
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
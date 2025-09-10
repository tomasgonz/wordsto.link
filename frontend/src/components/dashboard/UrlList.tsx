'use client';

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  Copy, 
  ExternalLink, 
  BarChart3, 
  MoreVertical, 
  Check,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Clock,
  MousePointer
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface Url {
  id: string;
  path: string;
  short_code: string;
  identifier: string | null;
  keywords: string[];
  destination_url: string;
  title: string | null;
  description: string | null;
  click_count: number;
  unique_visitors: number;
  clicks_24h: number;
  unique_visitors_24h: number;
  last_clicked_at: string | null;
  is_active: boolean;
  is_expired: boolean;
  expires_at: string | null;
  created_at: string;
  full_url: string;
  short_url: string | null;
}

interface UrlListProps {
  urls: Url[];
  onEdit?: (url: Url) => void;
  onDelete?: (url: Url) => void;
  onToggleActive?: (url: Url) => void;
}

export function UrlList({ urls, onEdit, onDelete, onToggleActive }: UrlListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for browsers that don't support clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy to clipboard');
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <div className="space-y-4">
      {urls.map((url) => (
        <div
          key={url.id}
          className={`bg-white rounded-lg border ${
            url.is_active ? 'border-gray-200' : 'border-gray-300 opacity-75'
          } p-4 hover:shadow-md transition-shadow`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {url.title || url.path}
                    </h3>
                    {!url.is_active && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                        Inactive
                      </span>
                    )}
                    {url.is_expired && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-600 rounded">
                        Expired
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <code className="text-sm font-mono text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                      {url.full_url}
                    </code>
                    <button
                      onClick={() => copyToClipboard(url.full_url, `full-${url.id}`)}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      {copiedId === `full-${url.id}` ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <a
                      href={url.destination_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span className="truncate max-w-xs">{url.destination_url}</span>
                    </a>
                  </div>

                  {url.description && (
                    <p className="mt-2 text-sm text-gray-500">{url.description}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {formatNumber(url.click_count)}
                  </div>
                  <div className="text-xs text-gray-500">Total Clicks</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {formatNumber(url.unique_visitors)}
                  </div>
                  <div className="text-xs text-gray-500">Visitors</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-primary-600">
                    {formatNumber(url.clicks_24h)}
                  </div>
                  <div className="text-xs text-gray-500">24h Clicks</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-primary-600">
                    {formatNumber(url.unique_visitors_24h)}
                  </div>
                  <div className="text-xs text-gray-500">24h Visitors</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/analytics/${url.path}`}
                  className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  title="View Analytics"
                >
                  <BarChart3 className="w-5 h-5" />
                </Link>

                <div className="relative">
                  <button
                    onClick={() => setMenuOpenId(menuOpenId === url.id ? null : url.id)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {menuOpenId === url.id && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                      {onEdit && (
                        <button
                          onClick={() => {
                            onEdit(url);
                            setMenuOpenId(null);
                          }}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                      )}
                      {onToggleActive && (
                        <button
                          onClick={() => {
                            onToggleActive(url);
                            setMenuOpenId(null);
                          }}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          {url.is_active ? (
                            <>
                              <EyeOff className="w-4 h-4" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4" />
                              Activate
                            </>
                          )}
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => {
                            onDelete(url);
                            setMenuOpenId(null);
                          }}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Created {formatDistanceToNow(new Date(url.created_at), { addSuffix: true })}
            </div>
            {url.last_clicked_at && (
              <div className="flex items-center gap-1">
                <MousePointer className="w-3 h-3" />
                Last clicked {formatDistanceToNow(new Date(url.last_clicked_at), { addSuffix: true })}
              </div>
            )}
            {url.expires_at && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Expires {format(new Date(url.expires_at), 'MMM d, yyyy')}
              </div>
            )}
            <div className="flex items-center gap-1">
              Keywords: {url.keywords.map(k => (
                <span key={k} className="px-1.5 py-0.5 bg-gray-100 rounded">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
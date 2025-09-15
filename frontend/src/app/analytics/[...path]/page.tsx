'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { 
  TrendingUp, Globe, Monitor, MousePointer, Clock, 
  Users, Link2, ArrowLeft, Download, Filter
} from 'lucide-react';
import Link from 'next/link';
import { useApiClient } from '@/hooks/useApi';

interface AnalyticsData {
  url: {
    id: string;
    path: string;
    identifier: string | null;
    keywords: string[];
    destination_url: string;
    title: string | null;
    created_at: string;
  };
  period: {
    type: string;
    start_date: string;
    end_date: string;
  };
  overview: {
    total_clicks: number;
    unique_visitors: number;
    days_active: number;
    avg_response_time: number;
    countries: number;
    bot_clicks: number;
  };
  timeline: Array<{
    timestamp: string;
    clicks: number;
    unique_visitors: number;
  }>;
  geographic: Array<{
    country_name: string;
    clicks: number;
    unique_visitors: number;
  }>;
  devices: {
    devices: Record<string, number>;
    browsers: Record<string, number>;
  };
  referrers: Array<{
    source: string;
    clicks: number;
    type: string;
  }>;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function AnalyticsPage() {
  const params = useParams();
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const api = useApiClient();
  
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [path, period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get(`/analytics/${path}?period=${period}`);
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  const formatChartData = () => {
    if (!data?.timeline) return [];
    
    return data.timeline.map(item => ({
      date: format(parseISO(item.timestamp), 'MMM d'),
      clicks: item.clicks,
      visitors: item.unique_visitors
    }));
  };

  const formatDeviceData = () => {
    if (!data?.devices.devices) return [];
    
    return Object.entries(data.devices.devices).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value
    }));
  };

  const formatBrowserData = () => {
    if (!data?.devices.browsers) return [];
    
    return Object.entries(data.devices.browsers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({
        name,
        value
      }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error || 'Failed to load analytics'}</p>
          <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700">
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
          
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {data.url.title || data.url.path}
              </h1>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Link className="w-4 h-4" />
                  <code className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                    wordsto.link/{data.url.path}
                  </code>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Created {format(parseISO(data.url.created_at), 'MMM d, yyyy')}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Filter className="w-5 h-5" />
              </button>
              
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Download className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Clicks</span>
              <MousePointer className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.overview.total_clicks.toLocaleString()}
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Unique Visitors</span>
              <Users className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.overview.unique_visitors.toLocaleString()}
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Countries</span>
              <Globe className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.overview.countries}
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Avg Response</span>
              <TrendingUp className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {Math.round(data.overview.avg_response_time)}ms
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Click Trends</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={formatChartData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="clicks" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="visitors" stroke="#10B981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Device Types</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={formatDeviceData()}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {formatDeviceData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Countries</h2>
            <div className="space-y-3">
              {data.geographic.slice(0, 10).map((country, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{country.country_name || 'Unknown'}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      {country.unique_visitors} visitors
                    </span>
                    <span className="font-semibold text-gray-900">
                      {country.clicks} clicks
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Referrers</h2>
            <div className="space-y-3">
              {data.referrers.slice(0, 10).map((referrer, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      referrer.type === 'direct' ? 'bg-gray-100 text-gray-600' :
                      referrer.type === 'social' ? 'bg-blue-100 text-blue-600' :
                      referrer.type === 'search' ? 'bg-green-100 text-green-600' :
                      'bg-purple-100 text-purple-600'
                    }`}>
                      {referrer.type}
                    </span>
                    <span className="text-sm text-gray-700 truncate max-w-xs">
                      {referrer.source}
                    </span>
                  </div>
                  <span className="font-semibold text-gray-900">
                    {referrer.clicks} clicks
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
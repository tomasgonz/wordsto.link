import Link from 'next/link';
import { ArrowRight, Link2, BarChart3, Shield, Zap } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="pt-20 pb-16 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Short URLs That Make{' '}
            <span className="text-primary-600">Sense</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Create memorable short URLs with keyword-based patterns. 
            Perfect for brands, campaigns, and teams who value clarity.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 transition-colors"
            >
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>

        <div className="py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-600">
              Create intuitive URL patterns that your audience will remember
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                <Link2 className="w-6 h-6 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Choose Your Pattern
              </h3>
              <p className="text-gray-600 mb-4">
                Create URLs like wordsto.link/company/product or wordsto.link/sale
              </p>
              <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                wordsto.link/your/keywords
              </code>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Track Performance
              </h3>
              <p className="text-gray-600 mb-4">
                Real-time analytics with geographic data, device breakdowns, and more
              </p>
              <div className="flex gap-2">
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">Clicks</span>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">Visitors</span>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">Countries</span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Stay in Control
              </h3>
              <p className="text-gray-600 mb-4">
                Own your identifiers, manage team access, and set expiration dates
              </p>
              <div className="flex gap-2">
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">Private</span>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">Team</span>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">API</span>
              </div>
            </div>
          </div>
        </div>

        <div className="py-16">
          <div className="bg-primary-600 rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to simplify your links?
            </h2>
            <p className="text-xl text-primary-100 mb-8">
              Start creating memorable short URLs in seconds
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg text-primary-600 bg-white hover:bg-gray-100 transition-colors"
            >
              Start Free Trial
              <Zap className="ml-2 w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
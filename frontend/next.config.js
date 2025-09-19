/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow images from all hosts during development
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Allow the Tailscale hostname
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self' http://ubuntu-server-1-hetzner-fsn1:* http://localhost:* http://127.0.0.1:* http://138.201.206.113:* 'unsafe-inline' 'unsafe-eval' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; font-src 'self' data:; connect-src 'self' http://ubuntu-server-1-hetzner-fsn1:* http://localhost:* http://127.0.0.1:* http://138.201.206.113:* ws://ubuntu-server-1-hetzner-fsn1:* ws://localhost:* ws://127.0.0.1:* ws://138.201.206.113:*;"
          }
        ]
      }
    ]
  },

  // Disable strict mode for better compatibility
  reactStrictMode: false,

  // Proxy API calls to backend
  async rewrites() {
    // Determine backend URL based on environment
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },

  // Allow all hosts in development
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
    }
    return config
  },
}

module.exports = nextConfig
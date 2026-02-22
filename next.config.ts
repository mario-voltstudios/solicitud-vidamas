import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'solicitud-vidamas.vercel.app', '*.vercel.app'],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lszwokdthvgzcjdlwxzp.supabase.co',
      },
    ],
  },
}

export default nextConfig

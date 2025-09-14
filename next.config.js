/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // 🚀 Gera servidor Node independente
  images: {
    unoptimized: true, // Importante para evitar problemas de img no mobile
  },
};

module.exports = nextConfig;

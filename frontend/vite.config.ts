import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
      '@inventory': path.resolve(__dirname, './src/features/inventory'),
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime.js'),
      'lucide-react': path.resolve(__dirname, './node_modules/lucide-react/dist/esm/lucide-react.js'),
      '@tanstack/react-query': path.resolve(__dirname, './node_modules/@tanstack/react-query/build/modern/index.js'),
      recharts: path.resolve(__dirname, './node_modules/recharts/es6/index.js'),
      sonner: path.resolve(__dirname, './node_modules/sonner/dist/index.mjs'),
    },
  },
  server: {
    port: 3003,
    strictPort: true,
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, './src/features/inventory'),
      ],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_INVENTORY_API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})


import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteImageCompress from './plugins/vite-plugin-image-compress';
import path from 'node:path';
export default defineConfig({
  resolve: {
    alias: {
        '@': path.resolve(__dirname, 'src')
    }
},
  plugins: [react(),viteImageCompress({
    // include: /\.(jpg|jpeg|png|gif|svg)$/i,
    exclude: /node_modules|dist/,
    sharpOptions: {
      jpeg: { quality: 75 }, // 0-100
      png: { quality: 75, compressionLevel: 6 }, // quality 0-100, compressionLevel 0-9
      webp: { quality: 75 }, // 0-100
      gif: {}, // Sharp's GIF optimization is limited
      avif: { quality: 50 }, // 0-100 (lower is smaller/lower quality)
    },
  })],
})

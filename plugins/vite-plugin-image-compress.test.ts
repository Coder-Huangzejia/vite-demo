import { describe, it, expect, vi, beforeEach } from 'vitest';
import viteImageCompress from './vite-plugin-image-compress';
import type { Plugin } from 'vite';
import sharp from 'sharp';

vi.mock('sharp', () => {
  const mockSharp = vi.fn();
  mockSharp.prototype.jpeg = vi.fn().mockReturnThis();
  mockSharp.prototype.png = vi.fn().mockReturnThis();
  mockSharp.prototype.webp = vi.fn().mockReturnThis();
  mockSharp.prototype.gif = vi.fn().mockReturnThis();
  mockSharp.prototype.avif = vi.fn().mockReturnThis();
  mockSharp.prototype.toBuffer = vi.fn().mockResolvedValue(Buffer.from('compressed'));
  return {
    default: mockSharp,
  };
});

vi.mock('picocolors', () => ({
  default: {
    green: vi.fn((str) => `green(${str})`),
    red: vi.fn((str) => `red(${str})`),
    yellow: vi.fn((str) => `yellow(${str})`),
    dim: vi.fn((str) => `dim(${str})`),
    cyan: vi.fn((str) => `cyan(${str})`),
  },
}));

describe('viteImageCompress', () => {
  let plugin: Plugin;
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  
  const mockConfig = {
    logger: mockLogger,
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    plugin = viteImageCompress();
    // @ts-expect-error - mock configResolved
    plugin.configResolved(mockConfig);
  });
  
  it('should return a Vite plugin object', () => {
    expect(plugin).toBeDefined();
    expect(plugin.name).toBe('vite-plugin-image-compress');
    expect(plugin.apply).toBe('build');
    expect(plugin.enforce).toBe('post');
  });
  

  describe('generateBundle', () => {
    it('should skip non-asset files', async () => {
      const bundle = {
        'file.js': { type: 'chunk', code: 'console.log("test")' },
        'image.jpg': { type: 'asset', source: Buffer.from('test') },
      };
      
      // @ts-expect-error - mock generateBundle
      await plugin.generateBundle({}, bundle);
      
      expect(sharp).toHaveBeenCalledTimes(1);
    });
    
    it('should skip files not matching include pattern', async () => {
      const plugin = viteImageCompress({ include: /\.(jpg|jpeg)$/ });
       // @ts-expect-error - mock configResolved
      plugin.configResolved(mockConfig);
      
      const bundle = {
        'image.jpg': { type: 'asset', source: Buffer.from('test') },
        'image.png': { type: 'asset', source: Buffer.from('test') },
      };
       // @ts-expect-error - mock generateBundle
      await plugin.generateBundle({}, bundle);
      
      expect(sharp).toHaveBeenCalledTimes(1);
    });
    
    it('should skip SVG files with log message', async () => {
      const bundle = {
        'image.svg': { type: 'asset', source: Buffer.from('<svg></svg>') },
      };
      
      // @ts-expect-error - mock generateBundle
      await plugin.generateBundle({}, bundle);
      
      expect(sharp).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('跳过 SVG 文件')
      );
    });
    
    it('should process JPEG with quality options', async () => {
      const bundle = {
        'image.jpg': { type: 'asset', source: Buffer.from('test') },
      };
      
      // @ts-expect-error - mock generateBundle
      await plugin.generateBundle({}, bundle);
      
      expect(sharp).toHaveBeenCalledWith(Buffer.from('test'));
      expect(sharp().jpeg).toHaveBeenCalledWith({ quality: 75 });
    });
    
    it('should process PNG with compression options', async () => {
      const bundle = {
        'image.png': { type: 'asset', source: Buffer.from('test') },
      };
      
      // @ts-expect-error - mock generateBundle
      await plugin.generateBundle({}, bundle);
      
      expect(sharp().png).toHaveBeenCalledWith({ quality: 75, compressionLevel: 6 });
    });
    
    it('should handle string sources for non-SVG files', async () => {
      const bundle = {
        'image.jpg': { type: 'asset', source: 'test' },
      };
      
      // @ts-expect-error - mock generateBundle
      await plugin.generateBundle({}, bundle);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('跳过非 SVG 的字符串资源')
      );
    });
    
    it('should log when compressed size is not smaller', async () => {
      const bundle = {
        'image.jpg': { type: 'asset', source: Buffer.from('test') },
      };
      
      // Mock toBuffer to return same size
      sharp.prototype.toBuffer.mockResolvedValueOnce(Buffer.from('test'));
      
      // @ts-expect-error - mock generateBundle
      await plugin.generateBundle({}, bundle);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('压缩后大小无变化')
      );
    });
    
    it('should handle processing errors', async () => {
      const bundle = {
        'image.jpg': { type: 'asset', source: Buffer.from('test') },
      };
      
      // Mock toBuffer to reject
      sharp.prototype.toBuffer.mockRejectedValueOnce(new Error('Processing failed'));
      
      // @ts-expect-error - mock generateBundle
      await plugin.generateBundle({}, bundle);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('处理 image.jpg 时出错')
      );
    });
  });
  
  describe('closeBundle', () => {
    beforeEach(async () => {
      const bundle = {
        'image.jpg': { type: 'asset', source: Buffer.from('test') },
        'image.png': { type: 'asset', source: Buffer.from('test') },
        'image.svg': { type: 'asset', source: Buffer.from('<svg></svg>') },
      };
      
      // @ts-expect-error - mock generateBundle
      await plugin.generateBundle({}, bundle);
      
      // Reset mock calls after generateBundle
      vi.clearAllMocks();
    });
    
    it('should not log when log option is false', () => {
      const plugin = viteImageCompress({ log: false });
      // @ts-expect-error - mock configResolved
      plugin.configResolved(mockConfig);
      // @ts-expect-error - mock closeBundle
      plugin.closeBundle();
      
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
    
    it('should log compression results', () => {
      // @ts-expect-error - mock closeBundle
      plugin.closeBundle();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('压缩结果')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('总原始大小')
      );
    });
    
    it('should correctly calculate savings', () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      plugin.closeBundle();
      
      // Verify the summary log contains savings info
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('总节省空间')
      );
    });
  });
  
  describe('custom options', () => {
    it('should allow custom compression options', async () => {
      const customPlugin = viteImageCompress({
        sharpOptions: {
          jpeg: { quality: 90 },
          png: { quality: 80, compressionLevel: 8 },
        },
      });
      // @ts-expect-error - mock configResolved
      customPlugin.configResolved(mockConfig);
      
      const bundle = {
        'image.jpg': { type: 'asset', source: Buffer.from('test') },
        'image.png': { type: 'asset', source: Buffer.from('test') },
      };
       // @ts-expect-error - mock generateBundle
      await customPlugin.generateBundle({}, bundle);
      
      expect(sharp().jpeg).toHaveBeenCalledWith({ quality: 90 });
      expect(sharp().png).toHaveBeenCalledWith({ quality: 80, compressionLevel: 8 });
    });
    
    it('should allow custom include/exclude patterns', async () => {
      const customPlugin = viteImageCompress({
        include: /\.(webp)$/,
        exclude: /excluded/,
      });
      // @ts-expect-error - mock configResolved
      customPlugin.configResolved(mockConfig);
      
      const bundle = {
        'image.webp': { type: 'asset', source: Buffer.from('test') },
        'excluded.webp': { type: 'asset', source: Buffer.from('test') },
        'image.jpg': { type: 'asset', source: Buffer.from('test') },
      };
       // @ts-expect-error - mock generateBundle
      await customPlugin.generateBundle({}, bundle);
      
      expect(sharp).toHaveBeenCalledTimes(1); // Only image.webp should be processed
    });
  });
});

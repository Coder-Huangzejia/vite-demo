import type { Plugin, ResolvedConfig } from 'vite';
import { createFilter, FilterPattern } from '@rollup/pluginutils';
import sharp, {
  type JpegOptions,
  type PngOptions,
  type WebpOptions,
  type GifOptions,
  type AvifOptions,
} from 'sharp';
import { Buffer } from 'buffer';
import colors from 'picocolors';
import path from 'node:path';

interface SharpCompressOptions {
  jpeg?: JpegOptions;
  png?: PngOptions;
  webp?: WebpOptions;
  gif?: GifOptions;
  avif?: AvifOptions;
  // 可以添加其他Sharp支持的格式选项
}

interface ImageCompressOptions {
  /**
   * @description 需要包含的文件。默认为匹配常见图片格式的正则表达式。
   * @default /\.(png|jpe?g|gif|svg|webp|avif)$/i
   */
  include?: FilterPattern;
  /**
   * @description 需要排除的文件。默认为 undefined (不排除任何文件)。
   * @default undefined
   */
  exclude?: FilterPattern;
  /**
   * @description 直接传递给 sharp 用于光栅图像压缩的选项。
   * 在这里设置压缩质量等级。SVG 文件将被忽略。
   * @example { jpeg: { quality: 80 }, png: { quality: 80, compressionLevel: 9 } }
   */
  sharpOptions?: SharpCompressOptions;
  /**
   * @description 是否打印详细的压缩日志。默认为 true。
   * @default true
   */
  log?: boolean;
}

/**
 * @description 将字节数格式化为更易读的单位 (Bytes, KB, MB, etc.)
 * @param {number} bytes - 需要格式化的字节数
 * @param {number} [decimals=2] - 保留的小数位数
 * @returns {string} 格式化后的字符串
 */
function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 Bytes'; // 修复 0 字节或无效输入的处理
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * @description Vite 图片压缩插件函数
 * @param {ImageCompressOptions} [userOptions={}] - 用户提供的配置选项
 * @returns {Plugin} 返回一个 Vite 插件对象
 */
export default function viteImageCompress(userOptions: ImageCompressOptions = {}): Plugin {
  const defaultOptions: Partial<ImageCompressOptions> = {
    include: /\.(png|jpe?g|gif|svg|webp|avif)$/i, // 默认包含 SVG，但会在处理时跳过
    exclude: undefined,
    sharpOptions: {
      jpeg: { quality: 75 },
      png: { quality: 75, compressionLevel: 6 },
      webp: { quality: 75 },
      gif: {},
      avif: { quality: 50 },
    },
    log: true,
  };

  const options: ImageCompressOptions = {
    ...defaultOptions,
    ...userOptions,
    sharpOptions: {
      ...defaultOptions.sharpOptions,
      ...(userOptions.sharpOptions || {}),
    },
  };

  const filter = createFilter(options.include, options.exclude);

  let viteConfig: ResolvedConfig;
  const processedFiles = new Map<string, { originalSize: number, compressedSize: number }>();

  return {
    name: 'vite-plugin-image-compress',
    apply: 'build',
    enforce: 'post',

    configResolved(resolvedConfig) {
      viteConfig = resolvedConfig;
    },

    async generateBundle(_, bundle) {
      const assets = Object.entries(bundle);
      const processingPromises: Promise<void>[] = [];

      for (const [fileName, assetInfo] of assets) {
        if (assetInfo.type !== 'asset' || !filter(fileName)) {
          continue;
        }

        let sourceBuffer: Buffer;
        let sourceIsString = false; // 标记源是否为字符串
        if (typeof assetInfo.source === 'string') {
          sourceBuffer = Buffer.from(assetInfo.source, 'utf-8'); // 假设字符串是 UTF-8
          sourceIsString = true;
        } else if (assetInfo.source instanceof Uint8Array) {
          sourceBuffer = Buffer.from(assetInfo.source);
        } else {
          viteConfig.logger.warn(colors.yellow(`[image-compress] 跳过未知源类型的资源: "${fileName}"`));
          continue;
        }

        const originalSize = sourceBuffer.byteLength;
        const ext = path.extname(fileName).toLowerCase();

        if (ext === '.svg') {
          if (options.log) {
            viteConfig.logger.info(colors.dim(`[image-compress] 跳过 SVG 文件 (不进行压缩): ${fileName}`));
          }
          // 记录原始大小，压缩大小视为相同
          processedFiles.set(fileName, { originalSize, compressedSize: originalSize });
          continue; // 直接处理下一个文件
        }

        // 对于非SVG文件，只处理 Buffer 类型的源
        if (sourceIsString) {
             // 如果源是字符串但不是SVG（理论上不常见，但为了健壮性），记录警告并跳过sharp处理
             viteConfig.logger.warn(colors.yellow(`[image-compress] 跳过非 SVG 的字符串资源: "${fileName}" (Sharp 需要 Buffer)`));
             processedFiles.set(fileName, { originalSize, compressedSize: originalSize });
             continue;
        }

        const task = async () => {
          try {
            let compressedBuffer: Buffer | null = null;
            let newSize = 0;
            let formatSpecificOptions: any;
            const sharpInstance = sharp(sourceBuffer); // 只有非 SVG 文件会到这里

            switch (ext) {
              case '.jpg':
              case '.jpeg':
                formatSpecificOptions = options.sharpOptions?.jpeg;
                if (formatSpecificOptions && Object.keys(formatSpecificOptions).length > 0) {
                   compressedBuffer = await sharpInstance.jpeg(formatSpecificOptions).toBuffer();
                }
                break;
              case '.png':
                formatSpecificOptions = options.sharpOptions?.png;
                 if (formatSpecificOptions && Object.keys(formatSpecificOptions).length > 0) {
                   compressedBuffer = await sharpInstance.png(formatSpecificOptions).toBuffer();
                 }
                break;
              case '.webp':
                formatSpecificOptions = options.sharpOptions?.webp;
                if (formatSpecificOptions && Object.keys(formatSpecificOptions).length > 0) {
                   compressedBuffer = await sharpInstance.webp(formatSpecificOptions).toBuffer();
                 }
                break;
              case '.gif':
                formatSpecificOptions = options.sharpOptions?.gif;
                if (formatSpecificOptions && Object.keys(formatSpecificOptions).length > 0) {
                    // 注意：sharp 对 GIF 的压缩选项有限，主要是优化调色板等
                    // 如果需要更强的 GIF 压缩，可能需要 gifsicle 等工具
                   compressedBuffer = await sharpInstance.gif(formatSpecificOptions).toBuffer();
                 }
                break;
              case '.avif':
                formatSpecificOptions = options.sharpOptions?.avif;
                if (formatSpecificOptions && Object.keys(formatSpecificOptions).length > 0) {
                   compressedBuffer = await sharpInstance.avif(formatSpecificOptions).toBuffer();
                 }
                break;
              default:
                // 理论上不会到这里，因为 filter 和 svg check 已经过滤
                if (options.log) {
                  viteConfig.logger.info(`[image-compress] 跳过不支持/未处理的格式: ${fileName}`);
                }
                processedFiles.set(fileName, { originalSize, compressedSize: originalSize });
                return; // 明确返回
            }

            // 如果没有应用任何 sharp 转换（因为没有选项或格式不支持）
             if (!compressedBuffer) {
                 compressedBuffer = sourceBuffer; // 保持原样
                 newSize = originalSize;
             } else {
                 newSize = compressedBuffer.length;
             }


            if (newSize < originalSize) {
              // Vite 内部会处理 Buffer，这里强制转换类型避免 TS 报错
              assetInfo.source = compressedBuffer as unknown as Uint8Array;
              processedFiles.set(fileName, { originalSize, compressedSize: newSize });
            } else {
              // 压缩后不小于原始大小，或没有进行压缩
              if (options.log && newSize > originalSize) {
                viteConfig.logger.info(colors.dim(`[image-compress] 跳过 ${fileName}, 压缩后大小 (${formatBytes(newSize)}) 不小于原始大小 (${formatBytes(originalSize)})`));
              } else if (options.log && newSize === originalSize && formatSpecificOptions && Object.keys(formatSpecificOptions).length > 0) {
                // 只有在尝试了压缩但大小没变时才记录“无变化”
                 viteConfig.logger.info(colors.dim(`[image-compress] 文件 ${fileName} 压缩后大小无变化 (${formatBytes(originalSize)})`));
              }
              // 记录大小（压缩后可能等于原始大小）
              processedFiles.set(fileName, { originalSize, compressedSize: originalSize }); // 记录原始大小以便报告正确
            }

          } catch (error: any) {
            viteConfig.logger.error(colors.red(`[image-compress] 处理 ${fileName} 时出错: ${error.message}`));
            processedFiles.set(fileName, { originalSize, compressedSize: originalSize }); // 记录错误，大小视为未变
          }
        };

        processingPromises.push(task());
      }

      await Promise.all(processingPromises);
    },

    closeBundle() {
        if (!options.log || processedFiles.size === 0) {
          return;
        }

        viteConfig.logger.info(colors.green('\n[vite-plugin-image-compress] 压缩结果:'));

        let totalOriginalSize = 0;
        let totalCompressedSize = 0;
        const tableData = [];

        // 准备表格数据
        for (const [fileName, sizes] of processedFiles.entries()) {
          const { originalSize, compressedSize } = sizes;
          totalOriginalSize += originalSize;
          totalCompressedSize += compressedSize;
          const sizeChange = originalSize - compressedSize;
          const percentageChange = originalSize > 0 ? (sizeChange / originalSize) * 100 : 0;
          const ext = path.extname(fileName).toLowerCase();

          let status: string;
          if (ext === '.svg') {
              status = colors.dim('已跳过 (SVG)');
          } else if (sizeChange > 0) {
              status = colors.green('已压缩');
          } else if (sizeChange === 0) {
              status = colors.dim('无变化/跳过'); // 合并无变化和因大小未减小而跳过的情况
          } else { // sizeChange < 0 (理论上 sharp 不会主动增大，除非有bug或特定配置) 或处理出错
              status = colors.red('错误/未压缩');
          }


          tableData.push({
            File: fileName,
            'Original Size': formatBytes(originalSize),
            // 如果是SVG或未压缩，显示原始大小
            'Compressed Size': formatBytes(compressedSize),
            'Savings': sizeChange > 0 ? `${formatBytes(sizeChange)} (${percentageChange.toFixed(1)}%)` : '-',
            Status: status
          });
        }

         // 计算列宽 (添加一些最小宽度)
        const headers = ['File', 'Original Size', 'Compressed Size', 'Savings', 'Status'];
        const minWidths: { [key: string]: number } = { 'File': 15, 'Original Size': 15, 'Compressed Size': 17, 'Savings': 20, 'Status': 15 };
        const colWidths: { [key: string]: number } = {};

        headers.forEach(header => {
            colWidths[header] = Math.max(
                minWidths[header] || 10,
                header.length,
                // eslint-disable-next-line no-control-regex
                ...tableData.map(row => String(row[header as keyof typeof row]).replace(/\x1b\[[0-9;]*m/g, '').length) // 计算长度时去除颜色代码
            );
        });


        // 输出表头
        let headerLine = '  ';
        let separatorLine = '  ';
        headers.forEach((header, index) => {
            headerLine += header.padEnd(colWidths[header]) + (index < headers.length - 1 ? ' | ' : '');
            separatorLine += '-'.repeat(colWidths[header]) + (index < headers.length - 1 ? ' | ' : '');
        });
        console.log(headerLine);
        console.log(separatorLine);


        // 输出表格内容
        tableData.forEach(row => {
            let rowLine = '  ';
             headers.forEach((header, index) => {
                const value = String(row[header as keyof typeof row]);
                // 计算实际显示长度（去除 ANSI 颜色代码）
                // eslint-disable-next-line no-control-regex
                const displayLength = value.replace(/\x1b\[[0-9;]*m/g, '').length;
                // 填充空格以对齐
                const padding = ' '.repeat(Math.max(0, colWidths[header] - displayLength));
                rowLine += value + padding + (index < headers.length - 1 ? ' | ' : '');
            });
            console.log(rowLine);
        });


        // 输出汇总信息
        const totalSavings = totalOriginalSize - totalCompressedSize;
        const totalPercentage = totalOriginalSize > 0 ? (totalSavings / totalOriginalSize) * 100 : 0;

        viteConfig.logger.info(
          colors.cyan(`\n  总原始大小: ${formatBytes(totalOriginalSize)}`) +
          colors.cyan(` | 总压缩后大小: ${formatBytes(totalCompressedSize)}`) +
          (totalSavings > 0 ? colors.green(` | 总节省空间: ${formatBytes(totalSavings)} (${totalPercentage.toFixed(1)}%)`) : colors.dim(' | 总节省空间: 无'))
        );
      }
  };
}

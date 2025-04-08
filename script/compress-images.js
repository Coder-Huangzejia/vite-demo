const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputDir = 'src/assets/images';
const outputDir = 'dist/images';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.readdirSync(inputDir).forEach(file => {
  const inputPath = path.join(inputDir, file);
  const outputPath = path.join(outputDir, file);

  sharp(inputPath)
    .resize(800) // 可选：调整大小
    .jpeg({ quality: 80 }) // 或 .png({ compressionLevel: 9 })
    .toFile(outputPath)
    .then(() => console.log(`Compressed: ${file}`))
    .catch(err => console.error(`Error processing ${file}:`, err));
});

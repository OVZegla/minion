// Génère les icônes PNG de l'app à partir de la mascotte (public/mascot.svg).
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const mascot = readFileSync('public/mascot.svg', 'utf8')
const inner = mascot.replace(/<svg[^>]*>/, '').replace('</svg>', '')
// viewBox de la mascotte : 200 130 854 1000

const square = (pad, radius) => {
  const size = 1000
  const h = size * (1 - pad * 2)
  const w = h * (854 / 1000)
  const x = (size - w) / 2
  const y = (size - h) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="#FFFBF0"/>
    <svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="200 130 854 1000">${inner}</svg>
  </svg>`
}

const jobs = [
  ['public/icons/icon-192.png', 192, square(0.1, 210)],
  ['public/icons/icon-512.png', 512, square(0.1, 210)],
  ['public/icons/maskable-512.png', 512, square(0.2, 0)], // zone sûre pour les icônes adaptatives
  ['public/icons/apple-touch-icon.png', 180, square(0.12, 0)],
]
for (const [out, px, svg] of jobs) {
  await sharp(Buffer.from(svg)).resize(px, px).png().toFile(out)
  console.log('✓', out)
}

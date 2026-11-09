/**
 * 產生 PWA 圖示。改了圖案就重跑：`node scripts/make-icons.mjs`
 *
 * 圖案是一圈環加一段實心弧（呼應統計頁的圓餅），科技風的深底與青色。
 * 弧與環都收在畫布 65% 的範圍內——Android 的 maskable 圖示會被裁成圓形，
 * 安全區約 80%，留夠餘裕才不會被切到。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const BG = '#05080d';
const AC = '#22d3ee';
const S = 512;
const C = S / 2;
const R = 150;
const W = 36;

/** 極座標轉 SVG 座標，0 弧度指向 12 點鐘。 */
function pt(deg, r = R) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

/** 一段圓弧的 path（只畫線，不填滿）。 */
function arc(fromDeg, toDeg) {
  const [x1, y1] = pt(fromDeg);
  const [x2, y2] = pt(toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="${AC}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${AC}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="${BG}"/>
  <rect width="${S}" height="${S}" fill="url(#glow)"/>
  <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${AC}" stroke-opacity="0.28" stroke-width="${W}"/>
  <path d="${arc(0, 132)}" fill="none" stroke="${AC}" stroke-width="${W}" stroke-linecap="butt"/>
  <circle cx="${C}" cy="${C}" r="7" fill="${AC}"/>
</svg>`;

const out = fileURLToPath(new URL('../public/', import.meta.url));
await mkdir(out, { recursive: true });
await writeFile(`${out}icon.svg`, svg, 'utf8');

// 192／512 給 Android 與 manifest，180 給 iOS 的 apple-touch-icon。
for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${out}${name}`);
  console.log(`  ${name}  ${size}×${size}`);
}
console.log('  icon.svg');

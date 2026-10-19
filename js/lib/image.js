// Bildhelfer: Canvas → Blob, Wasserzeichen, Verkleinern, Teilen/Download.

export function canvasFromImageData(buffer, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
  return canvas;
}

export function toBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob fehlgeschlagen'))), type, quality);
  });
}

/** Verkleinert auf maximale lange Kante; gibt neues Canvas zurück (oder dasselbe, wenn klein genug). */
export function resizeCanvas(canvas, maxLongEdge) {
  const long = Math.max(canvas.width, canvas.height);
  if (long <= maxLongEdge) return canvas;
  const f = maxLongEdge / long;
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * f);
  out.height = Math.round(canvas.height * f);
  out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = './assets/logo.svg';
    });
  }
  return logoPromise;
}

/** Kleines Logo unten rechts plus Textzeile. Zeichnet direkt ins Canvas. */
export async function drawWatermark(canvas, text) {
  const ctx = canvas.getContext('2d');
  const s = Math.max(canvas.width, canvas.height);
  const pad = s * 0.015;
  const fontPx = Math.max(12, Math.round(s * 0.016));
  const logoSize = fontPx * 1.8;
  ctx.save();
  ctx.font = `600 ${fontPx}px -apple-system, Helvetica, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(text).width;
  const boxW = textW + logoSize + pad * 2.5;
  const boxH = logoSize + pad;
  const x = canvas.width - boxW - pad;
  const y = canvas.height - boxH - pad;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, boxW, boxH, pad); else ctx.rect(x, y, boxW, boxH);
  ctx.fill();
  const logo = await loadLogo();
  if (logo) ctx.drawImage(logo, x + pad * 0.75, y + pad / 2, logoSize, logoSize);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(text, x + pad * 1.5 + logoSize, y + boxH / 2);
  ctx.restore();
}

/** Teilen per Web Share API mit Datei, sonst Download. Gibt 'shared' | 'downloaded' zurück. */
export async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // sonst Download versuchen
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
  return 'downloaded';
}

export function timestampName(prefix, ext = 'jpg') {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

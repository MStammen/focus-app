// Stapeln auf der Grafikkarte (WebGL2). Jedes Videobild geht direkt als Textur auf die GPU und wird dort
// in einen 32-Bit-Float-Puffer addiert (Mitteln, Integrieren) bzw. als Maximum übernommen (Aufhellen).
// Gerechnet wird im linearen Licht: sRGB → linear beim Einlesen, linear → sRGB bei der Ausgabe.
// Ausgelesen wird nur für Vorschau-Statistik (winzig), erstes Bild (Vorschaugröße) und Endergebnis.
//
// Braucht WebGL2 und EXT_color_buffer_float. Mit EXT_float_blend reicht ein Puffer (Addieren bzw. Maximum
// per Blending), sonst zwei Puffer im Wechsel. Klappt etwas nicht, liefert createGpuStacker() null und
// die Aufnahme nimmt den bisherigen Weg über den Worker (js/core/stack-worker.js).

const VS = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const LIN = `
vec3 lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 enc(vec3 l) { l = clamp(l, 0.0, 1.0); return mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, l)); }`;

// Einzelbild linear (für Blending in einen Puffer)
const FS_FRAME = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D frame; out vec4 o;${LIN}
void main() { o = vec4(lin(texture(frame, uv).rgb), 1.0); }`;

// Einzelbild mit bisherigem Puffer verrechnen (ohne Blending, zwei Puffer im Wechsel)
const FS_PINGPONG = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D frame; uniform sampler2D acc; uniform int useMax; out vec4 o;${LIN}
void main() {
  vec3 f = lin(texture(frame, uv).rgb);
  vec3 a = texture(acc, uv).rgb;
  o = vec4(useMax == 1 ? max(a, f) : a + f, 1.0);
}`;

// Ausgabe: Puffer × Faktor → sRGB (flip für die sichtbare Leinwand, deren Zeile 0 unten liegt)
const FS_OUT = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D acc; uniform float factor; uniform int flip; out vec4 o;${LIN}
void main() {
  vec2 t = flip == 1 ? vec2(uv.x, 1.0 - uv.y) : uv;
  o = vec4(enc(texture(acc, t).rgb * factor), 1.0);
}`;

// Einzelbild unverändert (für das Vorher-Bild)
const FS_COPY = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D frame; out vec4 o;
void main() { o = vec4(texture(frame, uv).rgb, 1.0); }`;

const STATS_W = 128; // Statistik (Histogramm, Ausgebranntes) aus einem kleinen Abbild

/**
 * createGpuStacker({ width, height, mode, previewScale, gain }) → Stapler oder null.
 * Stapler: { canvas, engine, count, addFrame(video), setGain(g), preview() → stats, finish() → Ergebnis wie vom Worker, destroy() }
 */
export function createGpuStacker({ width: W, height: H, mode, previewScale = 1, gain = 1 }) {
  if (typeof document === 'undefined') return null;
  const PW = previewScale > 1 ? Math.floor(W / previewScale) : W;
  const PH = previewScale > 1 ? Math.floor(H / previewScale) : H;
  const canvas = document.createElement('canvas');
  canvas.width = PW; canvas.height = PH;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
  if (Math.max(W, H) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) return null;
  const blend = !!gl.getExtension('EXT_float_blend');
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });

  // ---------- Programme ----------
  function program(fs) {
    const make = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, VS)); gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  let progFrame, progPing, progOut, progCopy;
  try {
    progFrame = blend ? program(FS_FRAME) : null;
    progPing = blend ? null : program(FS_PINGPONG);
    progOut = program(FS_OUT);
    progCopy = program(FS_COPY);
  } catch { return null; }
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ---------- Texturen und Puffer ----------
  function texture(internal, format, type, w, h) {
    const tx = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tx);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    if (w) gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
    return tx;
  }
  function target(tx) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    return ok ? fb : null;
  }
  const frameTex = texture(); // Videobild, Größe kommt mit jedem Bild
  const accs = [];
  for (let i = 0; i < (blend ? 1 : 2); i++) {
    const tx = texture(gl.RGBA32F, gl.RGBA, gl.FLOAT, W, H);
    const fb = target(tx);
    if (!fb || gl.getError() !== gl.NO_ERROR) { destroyGl(); return null; } // zu wenig Grafikspeicher
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    accs.push({ tx, fb });
  }
  let cur = 0; // Puffer mit dem aktuellen Stand
  const statsH = Math.max(1, Math.round(STATS_W * H / W));
  const statsTx = texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, STATS_W, statsH);
  const statsFb = target(statsTx);
  if (!statsFb) { destroyGl(); return null; }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  let count = 0, first = null, firstLuma = null;

  function draw(prog, fb, w, h, uniforms) {
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    let unit = 0;
    for (const [name, v] of Object.entries(uniforms)) {
      const loc = gl.getUniformLocation(prog, name);
      if (v && typeof v === 'object') { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(loc, unit); unit += 1; }
      else if (Number.isInteger(v) && name !== 'factor') gl.uniform1i(loc, v);
      else gl.uniform1f(loc, v);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function read(fb, w, h) {
    const px = new Uint8ClampedArray(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }
  /** Kleines RGBA8-Ziel anlegen, zeichnen, auslesen, wieder freigeben. */
  function renderRead(prog, w, h, uniforms) {
    const tx = texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, w, h);
    const fb = target(tx);
    draw(prog, fb, w, h, uniforms);
    const px = read(fb, w, h);
    gl.deleteFramebuffer(fb); gl.deleteTexture(tx);
    return px;
  }
  const factor = () => (mode === 'mean' ? (count > 0 ? 1 / count : 0) : mode === 'max' ? 1 : gain);

  function stats() {
    draw(progOut, statsFb, STATS_W, statsH, { acc: accs[cur].tx, factor: factor(), flip: 0 });
    const px = read(statsFb, STATS_W, statsH);
    const hist = new Array(64).fill(0);
    let clipped = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      hist[(l * 63 / 255) | 0] += 1;
      if (l >= 254) clipped += 1;
    }
    return { count, histogram: hist, clippedFraction: clipped / (STATS_W * statsH), firstLuma };
  }

  function destroyGl() {
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* egal */ }
  }

  return {
    canvas,
    engine: blend ? 'gpu' : 'gpu2',
    get count() { return count; },
    get lost() { return lost; },
    setGain(g) { gain = g; },
    /** Ein Videobild verrechnen. false, wenn die Grafikkarte nicht mehr mitspielt. */
    addFrame(video) {
      if (lost) return false;
      gl.bindTexture(gl.TEXTURE_2D, frameTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      if (count === 0) {
        // Vorher-Bild in Vorschaugröße und seine mittlere Helligkeit (sRGB, wie im Worker)
        first = renderRead(progCopy, PW, PH, { frame: frameTex });
        let sum = 0;
        for (let i = 0; i < first.length; i += 4) sum += 0.2126 * first[i] + 0.7152 * first[i + 1] + 0.0722 * first[i + 2];
        firstLuma = sum / (PW * PH) / 255;
      }
      if (blend) {
        gl.enable(gl.BLEND);
        gl.blendEquation(mode === 'max' ? gl.MAX : gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE);
        draw(progFrame, accs[0].fb, W, H, { frame: frameTex });
        gl.disable(gl.BLEND);
      } else {
        const next = 1 - cur;
        draw(progPing, accs[next].fb, W, H, { frame: frameTex, acc: accs[cur].tx, useMax: mode === 'max' ? 1 : 0 });
        cur = next;
      }
      count += 1;
      return !lost && gl.getError() === gl.NO_ERROR;
    },
    /** Vorschau auf die eigene Leinwand zeichnen; liefert Statistik wie der Worker. */
    preview() {
      if (lost || count === 0) return { count, firstLuma };
      const s = stats();
      draw(progOut, null, PW, PH, { acc: accs[cur].tx, factor: factor(), flip: 1 });
      return s;
    },
    /** Endergebnis in voller Größe (Aufbau wie die Antwort 'result' des Workers). */
    finish() {
      if (lost || count === 0) return { buffer: null };
      const s = stats();
      const px = renderRead(progOut, W, H, { acc: accs[cur].tx, factor: factor(), flip: 0 });
      return { buffer: px.buffer, width: W, height: H, first: first ? first.buffer : null, firstWidth: PW, firstHeight: PH, stats: s };
    },
    destroy() { destroyGl(); canvas.remove(); },
  };
}

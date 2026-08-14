const ui = {
  play: document.getElementById("playBtn"),
  pause: document.getElementById("pauseBtn"),
  reset: document.getElementById("resetBtn"),
  slider: document.getElementById("timeSlider"),
  zScale: document.getElementById("zScale"),
  speed: document.getElementById("speedSelect"),
  timeLabel: document.getElementById("timeLabel"),
  maxDepth: document.getElementById("maxDepth"),
  maxVelocity: document.getElementById("maxVelocity"),
  affectedArea: document.getElementById("affectedArea"),
  movingArea: document.getElementById("movingArea"),
};

let demo;
let canvas;
let ctx;
let frameIndex = 0;
let playing = false;
let timer = null;
let zScale = 1.8;
let yaw = -0.72;
let pitch = 0.76;
let zoom = 1.08;
let dragging = false;
let dragStart = { x: 0, y: 0, yaw: 0, pitch: 0 };

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function terrainAt(row, col) {
  return demo.terrain[row * demo.meta.nx + col];
}

function world(x, y, z) {
  return {
    x: x - (demo.meta.xmin + demo.meta.xmax) / 2,
    y: y - (demo.meta.ymin + demo.meta.ymax) / 2,
    z: (z - demo.meta.demMin) * zScale,
  };
}

function project(p) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const xr = p.x * cy - p.y * sy;
  const yr = p.x * sy + p.y * cy;
  const screenY = yr * cp - p.z * sp;
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / 1120, rect.height / 900) * zoom;
  return {
    x: rect.width / 2 + xr * scale,
    y: rect.height / 2 + 145 + screenY * scale,
    depth: yr * sp + p.z * cp,
  };
}

function terrainColor(cell) {
  const low = [55, 86, 62];
  const mid = [130, 121, 76];
  const high = [150, 143, 134];
  const t = cell.elev;
  const mix = t < 0.58 ? t / 0.58 : (t - 0.58) / 0.42;
  const a = t < 0.58 ? low : mid;
  const b = t < 0.58 ? mid : high;
  const shade = 0.52 + cell.shade * 0.58;
  return `rgb(${Math.round(lerp(a[0], b[0], mix) * shade)},${Math.round(lerp(a[1], b[1], mix) * shade)},${Math.round(lerp(a[2], b[2], mix) * shade)})`;
}

function depthColor(depth, alpha = 0.78) {
  const t = clamp(depth / demo.meta.depthColorCap, 0, 1);
  const stops = [
    [255, 243, 164],
    [245, 167, 66],
    [217, 53, 28],
    [94, 11, 16],
  ];
  const p = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p));
  const f = p - i;
  const c0 = stops[i];
  const c1 = stops[i + 1];
  return `rgba(${Math.round(lerp(c0[0], c1[0], f))},${Math.round(lerp(c0[1], c1[1], f))},${Math.round(lerp(c0[2], c1[2], f))},${alpha})`;
}

function quadForCell(cell, extraZ = 0) {
  const h = demo.meta.dx / 2;
  const z = cell.z + extraZ;
  const pts = [
    project(world(cell.x - h, cell.y - h, z)),
    project(world(cell.x + h, cell.y - h, z)),
    project(world(cell.x + h, cell.y + h, z)),
    project(world(cell.x - h, cell.y + h, z)),
  ];
  return {
    pts,
    depth: pts.reduce((s, p) => s + p.depth, 0) / pts.length,
  };
}

function drawPoly(pts, fill, stroke = null) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.45;
    ctx.stroke();
  }
}

function drawTerrain() {
  const items = demo.terrain.map((cell) => ({ cell, ...quadForCell(cell) }));
  items.sort((a, b) => a.depth - b.depth);
  for (const item of items) {
    drawPoly(item.pts, terrainColor(item.cell), "rgba(0,0,0,0.08)");
  }
}

function drawDebris(frame) {
  const wet = frame.cells
    .filter((cell) => cell.h > 0.05)
    .map((cell) => {
      const terrain = terrainAt(cell.r, cell.c);
      return {
        cell,
        ...quadForCell(terrain, Math.min(cell.h, 8) * 2.3),
      };
    });
  wet.sort((a, b) => a.depth - b.depth);

  ctx.save();
  ctx.shadowColor = "rgba(255, 83, 21, 0.25)";
  ctx.shadowBlur = 12;
  for (const item of wet) {
    drawPoly(item.pts, depthColor(item.cell.h, 0.24));
  }
  ctx.restore();

  for (const item of wet) {
    drawPoly(item.pts, depthColor(item.cell.h, 0.82), "rgba(255,255,255,0.12)");
  }
}

function drawChannel() {
  ctx.save();
  ctx.strokeStyle = "rgba(90, 213, 255, 0.9)";
  ctx.lineWidth = 2.2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  demo.channel.forEach((p, i) => {
    const nearest = demo.terrain.reduce((best, cell) => {
      const d = Math.hypot(cell.x - p.x, cell.y - p.y);
      return d < best.d ? { cell, d } : best;
    }, { cell: null, d: Infinity }).cell;
    const q = project(world(p.x, p.y, nearest.z + 8));
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawPoint(point, color) {
  const p = project(world(point.x, point.y, point.z + 18));
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = "13px Segoe UI, sans-serif";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#f7fbff";
  ctx.strokeText(point.label, p.x + 10, p.y - 10);
  ctx.fillText(point.label, p.x + 10, p.y - 10);
  ctx.restore();
}

function drawPoints() {
  drawPoint(demo.controlPoints.C2, "#ff4d3d");
  drawPoint(demo.controlPoints.C1, "#ffd044");
  drawPoint(demo.controlPoints.valleyBottom, "#8fd3ff");
}

function updateStats(frame) {
  ui.timeLabel.textContent = frame.time;
  ui.maxDepth.textContent = `${frame.stats.maxDepth.toFixed(2)} m`;
  ui.maxVelocity.textContent = `${frame.stats.maxVelocity.toFixed(2)} m/s`;
  ui.affectedArea.textContent = `${Math.round(frame.stats.affectedArea).toLocaleString()} m²`;
  ui.movingArea.textContent = `${Math.round(frame.stats.movingArea).toLocaleString()} m²`;
}

function draw() {
  if (!demo) return;
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  const grad = ctx.createLinearGradient(0, 0, 0, rect.height);
  grad.addColorStop(0, "#071018");
  grad.addColorStop(1, "#111b22");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, rect.width, rect.height);
  drawTerrain();
  drawDebris(demo.frames[frameIndex]);
  drawChannel();
  drawPoints();
  updateStats(demo.frames[frameIndex]);
}

function resize() {
  const rect = document.getElementById("scene").getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function setFrame(index) {
  frameIndex = clamp(index, 0, demo.frames.length - 1);
  ui.slider.value = frameIndex;
  draw();
}

function play() {
  playing = true;
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(() => setFrame(frameIndex >= demo.frames.length - 1 ? 0 : frameIndex + 1), Number(ui.speed.value));
}

function pause() {
  playing = false;
  if (timer) window.clearInterval(timer);
  timer = null;
}

async function init() {
  demo = await fetch("data/demo-data.json").then((r) => r.json());
  const root = document.getElementById("scene");
  canvas = document.createElement("canvas");
  ctx = canvas.getContext("2d");
  root.appendChild(canvas);
  ui.slider.max = demo.frames.length - 1;
  const bestFrame = demo.frames.reduce((best, frame, index) => {
    const score = frame.stats.affectedArea + frame.stats.maxDepth * 600;
    return score > best.score ? { index, score } : best;
  }, { index: 0, score: -Infinity }).index;

  ui.slider.addEventListener("input", () => setFrame(Number(ui.slider.value)));
  ui.zScale.addEventListener("input", () => {
    zScale = Number(ui.zScale.value);
    draw();
  });
  ui.play.addEventListener("click", play);
  ui.pause.addEventListener("click", pause);
  ui.speed.addEventListener("change", () => {
    if (playing) play();
  });
  ui.reset.addEventListener("click", () => {
    pause();
    setFrame(0);
  });
  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY, yaw, pitch };
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    yaw = dragStart.yaw + (e.clientX - dragStart.x) * 0.006;
    pitch = clamp(dragStart.pitch + (e.clientY - dragStart.y) * 0.004, 0.38, 1.18);
    draw();
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoom = clamp(zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.65, 2.4);
    draw();
  }, { passive: false });
  window.addEventListener("resize", resize);
  resize();
  setFrame(bestFrame);
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre style="padding:24px;color:#ffd1d1">3D demo failed: ${error.message}</pre>`;
});


import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ---------- DOM ----------
const canvas = document.getElementById('stage');
const motionBtn = document.getElementById('motionBtn');

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // clamp DPR for perf

// ---------- Scene & Camera ----------
const scene = new THREE.Scene();
scene.background = null; // keep transparent over CSS gradient

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 0, 6);
scene.add(camera);

// Optional subtle fog to fade distant points (helps with depth on dark bg)
scene.fog = new THREE.Fog(0x0b0e14, 10, 18);

// ---------- Particles ----------
const group = new THREE.Group();
scene.add(group);

// Heuristic: fewer points on mobile
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const COUNT = isMobile ? 3500 : 7000;
const RADIUS = 3.0;

const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);

// Utility: random point inside a sphere (denser near center for nice "swarm" look)
function sampleSphere(radius = 1) {
  // Uniform direction
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  // Non-uniform radius (pow<1 => denser center)
  const r = radius * Math.pow(Math.random(), 0.5);
  const sinPhi = Math.sin(phi);
  const x = r * sinPhi * Math.cos(theta);
  const y = r * sinPhi * Math.sin(theta);
  const z = r * Math.cos(phi);
  return [x, y, z];
}

// Palette: two-tone lerp (tech vibe)
const colorA = new THREE.Color('#7AA2FF');
const colorB = new THREE.Color('#FF9EC4');
function lerpColor(out, t) {
  out.r = colorA.r + (colorB.r - colorA.r) * t;
  out.g = colorA.g + (colorB.g - colorA.g) * t;
  out.b = colorA.b + (colorB.b - colorA.b) * t;
}

const tmpColor = new THREE.Color();
for (let i = 0; i < COUNT; i++) {
  const i3 = i * 3;
  const [x, y, z] = sampleSphere(RADIUS);
  positions[i3 + 0] = x;
  positions[i3 + 1] = y;
  positions[i3 + 2] = z;

  // Color by Y (height) mixed with random seed
  const t = THREE.MathUtils.clamp(0.5 + 0.5 * (y / RADIUS) * 0.8 + (Math.random() - 0.5) * 0.2, 0, 1);
  lerpColor(tmpColor, t);
  colors[i3 + 0] = tmpColor.r;
  colors[i3 + 1] = tmpColor.g;
  colors[i3 + 2] = tmpColor.b;
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
  size: 0.035,
  vertexColors: true,
  transparent: true,
  opacity: 0.95,
  sizeAttenuation: true,
});

const points = new THREE.Points(geometry, material);
group.add(points);

// Fake glow: duplicate with larger size and lower opacity
const glowMaterial = new THREE.PointsMaterial({
  size: 0.11,
  vertexColors: true,
  transparent: true,
  opacity: 0.15,
  depthWrite: false,
  sizeAttenuation: true,
});
const glow = new THREE.Points(geometry, glowMaterial);
group.add(glow);

// ---------- Sizing ----------
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resize);
resize();

// ---------- Motion (Gyro + Mouse Fallback) ----------
let targetRotX = 0, targetRotY = 0;
let baseline = { beta: null, gamma: null };

// Map device orientation angles (deg) into small radians rotations
function mapTilt(betaDeg, gammaDeg) {
  if (baseline.beta === null) { baseline.beta = betaDeg; }
  if (baseline.gamma === null) { baseline.gamma = gammaDeg; }
  const db = THREE.MathUtils.clamp(betaDeg - baseline.beta, -45, 45);
  const dg = THREE.MathUtils.clamp(gammaDeg - baseline.gamma, -45, 45);
  targetRotX = THREE.MathUtils.degToRad(THREE.MathUtils.mapLinear(db, -45, 45, -15, 15));
  targetRotY = THREE.MathUtils.degToRad(THREE.MathUtils.mapLinear(dg, -45, 45, -25, 25));
}

// Try enabling orientation listener (iOS needs a user gesture)
async function enableGyro() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const state = await DeviceOrientationEvent.requestPermission();
      if (state !== 'granted') throw new Error('Permission denied');
    }
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      mapTilt(e.beta, e.gamma);
      motionBtn.classList.add('hide');
    }, { passive: true });
  } catch (err) {
    console.warn('[gyro] not available or permission denied:', err);
  }
}
document.getElementById('motionBtn').addEventListener('click', enableGyro);

// Android (no requestPermission): auto-try
if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
  enableGyro();
}

// Mouse fallback for desktop
window.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const nx = (e.clientX - rect.left) / rect.width * 2 - 1;
  const ny = (e.clientY - rect.top) / rect.height * 2 - 1;
  targetRotY = nx * 0.35;
  targetRotX = -ny * 0.22;
});

// ---------- Animation ----------
const clock = new THREE.Clock();
function animate() {
  resize();
  const t = clock.getElapsedTime();

  // Color cycle over time (HSV hue rotation)
  const hue = (t * 10) % 360;   // speed: degrees per second
  const newColor = new THREE.Color(`hsl(${hue}, 80%, 60%)`);
  material.color.copy(newColor);
  glowMaterial.color.copy(newColor);

  group.rotation.y += 0.0015;
  group.rotation.x += (targetRotX - group.rotation.x) * 0.08;
  group.rotation.y += (targetRotY - group.rotation.y) * 0.08;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

const colorsAttr = geometry.getAttribute('color');
for (let i = 0; i < COUNT; i++) {
  if (Math.random() < 0.005) { // ~0.5% chance per frame
    const i3 = i * 3;
    const c = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
    colorsAttr.array[i3 + 0] = c.r;
    colorsAttr.array[i3 + 1] = c.g;
    colorsAttr.array[i3 + 2] = c.b;
  }
}
colorsAttr.needsUpdate = true;


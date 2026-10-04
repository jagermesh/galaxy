import * as THREE from 'three';
import {
  OrbitControls,
} from 'three/addons/controls/OrbitControls.js';
import {
  CSS2DObject, CSS2DRenderer,
} from 'three/addons/renderers/CSS2DRenderer.js';

const $ = (selector) => document.querySelector(selector);
const sceneHost = $('#scene');
const app = $('#app');
const ui = {
  hero: $('#hero-copy'),
  card: $('#selection-card'),
  name: $('#selected-name'),
  stellarClass: $('#selected-class'),
  distance: $('#selected-distance'),
  planets: $('#selected-planets'),
  swatch: $('#star-swatch'),
  proximityLabel: $('#proximity-label'),
  proximityValue: $('#proximity-value'),
  proximityProgress: $('#proximity-progress'),
  fly: $('#fly-button'),
  flyLabel: $('#fly-label'),
  back: $('#back-button'),
  mode: $('#mode-label'),
  coordinates: $('#coordinates'),
  systemPanel: $('#system-panel'),
  systemName: $('#system-name'),
  systemDescription: $('#system-description'),
  planetCount: $('#planet-count'),
  moonCount: $('#moon-count'),
  curtain: $('#transition-curtain'),
  fuel: $('#fuel-value'),
  probes: $('#probe-value'),
  data: $('#data-value'),
  fragments: $('#fragment-value'),
  missionText: $('#mission-text'),
  scanPanel: $('#scan-panel'),
  scanName: $('#scan-name'),
  scanKind: $('#scan-kind'),
  scanSignal: $('#scan-signal'),
  scanResult: $('#scan-result'),
  scanProgress: $('#scan-progress'),
  scanButton: $('#scan-button'),
  toast: $('#game-toast'),
  complete: $('#mission-complete'),
  completeSystems: $('#complete-systems'),
  completeData: $('#complete-data'),
  continueButton: $('#continue-button'),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.FogExp2(0x02040a, 0.0055);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 1800);
camera.position.set(0, 17, 44);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
sceneHost.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.className = 'label-layer';
sceneHost.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 4.5;
controls.maxDistance = 105;
controls.rotateSpeed = 0.42;
controls.zoomSpeed = 0.75;
controls.zoomToCursor = false;
controls.screenSpacePanning = true;

const galaxyGroup = new THREE.Group();
const systemGroup = new THREE.Group();
systemGroup.visible = false;
scene.add(galaxyGroup, systemGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const SYSTEM_TIME_SCALE = 0.28;
const STAR_FOCUS_DISTANCE = 18;
const SAVE_KEY = 'stellar-atlas-expedition-v2';
const galaxyStars = [];
const clickableStars = [];
const orbitalBodies = [];
const spinningBodies = [];
const systemClickables = [];
let selectedStar = null;
let activeMode = 'galaxy';
let navigationTween = null;
let transitionLocked = false;
let pointerDown = null;
let focusedSystemObject = null;
let activeScanTarget = null;
let scanInProgress = false;
let toastTimer = null;
const focusedWorldPosition = new THREE.Vector3();
const pressedKeys = new Set();
const navigationRight = new THREE.Vector3();
const navigationUp = new THREE.Vector3();
const navigationDirection = new THREE.Vector3();

const DEFAULT_GAME_STATE = {
  fuel: 100,
  probes: 6,
  data: 0,
  fragments: 0,
  currentLocation: null,
  scanned: [],
  visitedSystems: [],
  completed: false,
};

function loadGameState() {
  try {
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY));
    return {
      ...DEFAULT_GAME_STATE,
      ...stored,
      scanned: Array.isArray(stored?.scanned) ? stored.scanned : [],
      visitedSystems: Array.isArray(stored?.visitedSystems) ? stored.visitedSystems : [],
    };
  } catch {
    return { ...DEFAULT_GAME_STATE };
  }
}

const gameState = loadGameState();

function saveGameState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
}

function missionCopy() {
  if (gameState.fragments >= 3) return 'Источник сигнала определён — исследование можно продолжить';
  if (gameState.fragments === 2) return 'Найти последний фрагмент сигнала';
  if (gameState.fragments === 1) return 'Найти ещё два фрагмента сигнала';
  return 'Обнаружить первый фрагмент сигнала';
}

function updateGameUI() {
  ui.fuel.textContent = gameState.fuel;
  ui.probes.textContent = gameState.probes;
  ui.data.textContent = gameState.data;
  ui.fragments.textContent = gameState.fragments;
  ui.missionText.textContent = missionCopy();
}

function showToast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.add('visible');
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2800);
}

function currentStar() {
  return galaxyStars.find((star) => star.name === gameState.currentLocation) || null;
}

function routeCost(star) {
  const origin = currentStar();
  const distance = origin ? origin.position.distanceTo(star.position) : star.position.length();
  return origin?.name === star.name ? 0 : THREE.MathUtils.clamp(Math.ceil(distance * 0.34), 5, 28);
}

function updateRouteButton() {
  if (!selectedStar) return;
  const cost = routeCost(selectedStar);
  ui.flyLabel.textContent = cost === 0 ? 'ВОЙТИ В СИСТЕМУ' : `ПРЫЖОК · ${cost} ТОПЛИВА`;
  ui.fly.disabled = gameState.fuel < cost;
}

const STAR_TYPES = [
  {
    type: 'G2 V',
    color: 0xffe6a6,
    label: 'жёлтый карлик',
  },
  {
    type: 'K1 V',
    color: 0xffad6a,
    label: 'оранжевый карлик',
  },
  {
    type: 'M4 V',
    color: 0xff7668,
    label: 'красный карлик',
  },
  {
    type: 'F7 V',
    color: 0xfff1cf,
    label: 'жёлто-белая звезда',
  },
  {
    type: 'A3 V',
    color: 0xc6deff,
    label: 'белая звезда',
  },
  {
    type: 'B8 V',
    color: 0x88bdff,
    label: 'голубой гигант',
  },
];

const planetPalette = [0x7fc8e5, 0xc68f65, 0x7f9d74, 0xad94d6, 0xe0bb72, 0x748ba8, 0xd16e6e, 0x83b6aa];
const prefixes = ['Astra', 'Cygni', 'Helion', 'Lyra', 'Vega', 'Orion', 'Caeli', 'Draco', 'Nexa', 'Talos', 'Kepler', 'Mira', 'Altair', 'Cetus', 'Eos', 'Vesper'];
const suffixes = ['Prime', 'Minor', '-7', '-9', '-12', '-17', '-24', 'A', 'B', 'Delta', 'Epsilon', 'Nova'];
const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeStarName(index, random) {
  const prefix = prefixes[Math.floor(random() * prefixes.length)];
  const suffix = suffixes[Math.floor(random() * suffixes.length)];
  return `${prefix} ${suffix}${index % 9 === 0 ? ` / ${String(index + 1).padStart(3, '0')}` : ''}`;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.08, 'rgba(255,255,255,.98)');
  gradient.addColorStop(0.22, 'rgba(255,255,255,.44)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,.09)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const glowTexture = makeGlowTexture();

function makeLabel(text, className = '') {
  const element = document.createElement('div');
  element.className = `object-label ${className}`.trim();
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.userData.element = element;
  return label;
}

function createBackgroundField() {
  const random = mulberry32(90125);
  const positions = [];
  const colors = [];
  for (let index = 0; index < 2400; index += 1) {
    const radius = 90 + random() * 630;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
    const luminance = 0.28 + random() * 0.56;
    colors.push(luminance * 0.72, luminance * 0.86, luminance);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.32,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    sizeAttenuation: true,
    depthWrite: false,
  });
  scene.add(new THREE.Points(geometry, material));
}

function createSectorGrid() {
  const points = [];
  const size = 54;
  const step = 6;
  for (let i = -size; i <= size; i += step) {
    points.push(-size, -10, i, size, -10, i, i, -10, -size, i, -10, size);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x31505c,
    transparent: true,
    opacity: 0.095,
  });
  galaxyGroup.add(new THREE.LineSegments(geometry, material));
}

function createGalaxy() {
  const random = mulberry32(40791);
  const links = [];

  for (let index = 0; index < 170; index += 1) {
    const type = STAR_TYPES[Math.min(STAR_TYPES.length - 1, Math.floor(random() ** 1.6 * STAR_TYPES.length))];
    const arm = index % 4;
    const radius = 4 + random() ** 0.68 * 42;
    const angle = radius * 0.17 + arm * (Math.PI / 2) + (random() - 0.5) * 0.72;
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      (random() - 0.5) * (4 + radius * 0.2),
      Math.sin(angle) * radius,
    );
    const size = 0.17 + random() * 0.22 + (type.type.startsWith('B') ? 0.12 : 0);
    const name = makeStarName(index, random);
    const planetCount = 1 + Math.floor(random() * 8);
    const magnitude = (0.2 + random() * 6.4).toFixed(2);

    const material = new THREE.SpriteMaterial({
      map: glowTexture,
      color: type.color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(size * 5.6);
    sprite.userData = {
      kind: 'star',
      index,
      name,
      type,
      planetCount,
      magnitude,
      position,
      size,
    };
    galaxyGroup.add(sprite);
    clickableStars.push(sprite);

    const major = index < 16 || random() > 0.84;
    const label = makeLabel(name.toUpperCase(), major ? 'major' : '');
    label.position.copy(position).add(new THREE.Vector3(size * 1.4, size * 0.3, 0));
    label.userData.major = major;
    label.userData.star = sprite;
    galaxyGroup.add(label);

    galaxyStars.push({
      sprite,
      label,
      ...sprite.userData,
    });

    if (index > 0 && index < 68 && random() > 0.48) {
      const previous = galaxyStars[Math.max(0, index - 1 - Math.floor(random() * Math.min(index, 7)))];
      if (previous.position.distanceTo(position) < 18) {
        links.push(...position.toArray(), ...previous.position.toArray());
      }
    }
  }

  const linkGeometry = new THREE.BufferGeometry();
  linkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(links, 3));
  galaxyGroup.add(
    new THREE.LineSegments(
      linkGeometry,
      new THREE.LineBasicMaterial({
        color: 0x65b4c6,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
    ),
  );
}

function setPointer(event) {
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
}

function pickObject(event, moveOnly = false) {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const targets = activeMode === 'galaxy' ? clickableStars : systemClickables;
  const hits = raycaster.intersectObjects(targets, false);
  renderer.domElement.style.cursor = hits.length ? 'pointer' : 'grab';
  if (!moveOnly && hits.length) {
    if (activeMode === 'galaxy') {
      selectStar(hits[0].object);
    } else {
      centerSystemObject(hits[0].object);
    }
  }
}

function centerSystemObject(object) {
  const focusTarget = object.userData.focusTarget || object;
  selectScanTarget(focusTarget);
  const destination = focusTarget.getWorldPosition(new THREE.Vector3());
  const targetShift = destination.clone().sub(controls.target);
  navigationTween = {
    kind: 'pan',
    started: performance.now(),
    duration: 620,
    fromTarget: controls.target.clone(),
    toTarget: destination,
    fromCamera: camera.position.clone(),
    toCamera: camera.position.clone().add(targetShift),
    focusObject: focusTarget,
  };
}

function selectStar(sprite) {
  focusedSystemObject = null;
  if (selectedStar) {
    selectedStar.label.userData.element.classList.remove('selected');
  }
  selectedStar = galaxyStars.find((star) => star.sprite === sprite);
  selectedStar.label.userData.element.classList.add('selected');
  ui.card.classList.add('visible');
  ui.name.textContent = selectedStar.name;
  ui.stellarClass.textContent = `${selectedStar.type.type} · ${selectedStar.type.label}`;
  ui.distance.textContent = `${(selectedStar.position.length() * 2.73 + 8).toFixed(1)} св. лет`;
  ui.planets.textContent = String(selectedStar.planetCount).padStart(2, '0');
  ui.swatch.style.background = `#${selectedStar.type.color.toString(16).padStart(6, '0')}`;
  ui.swatch.style.color = ui.swatch.style.background;
  updateRouteButton();

  const from = controls.target.clone();
  const to = selectedStar.position.clone();
  const viewDirection = camera.position.clone().sub(from).normalize();
  navigationTween = {
    kind: 'pan',
    started: performance.now(),
    duration: 820,
    fromTarget: from,
    toTarget: to,
    fromCamera: camera.position.clone(),
    toCamera: to.clone().add(viewDirection.multiplyScalar(STAR_FOCUS_DISTANCE)),
  };
}

function startFlight() {
  if (!selectedStar || transitionLocked || activeMode !== 'galaxy') {
    return;
  }
  const cost = routeCost(selectedStar);
  if (gameState.fuel < cost) {
    showToast(`Недостаточно топлива: требуется ${cost}`);
    return;
  }
  const direction = camera.position.clone().sub(controls.target).normalize();
  navigationTween = {
    kind: 'flight',
    started: performance.now(),
    duration: 1800,
    fromTarget: controls.target.clone(),
    toTarget: selectedStar.position.clone(),
    fromCamera: camera.position.clone(),
    toCamera: selectedStar.position.clone().add(direction.multiplyScalar(4.8)),
  };
}

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function updateNavigation(now) {
  if (!navigationTween) {
    return;
  }
  const raw = Math.min(1, (now - navigationTween.started) / navigationTween.duration);
  const progress = easeInOutCubic(raw);
  controls.target.lerpVectors(navigationTween.fromTarget, navigationTween.toTarget, progress);
  if (navigationTween.kind === 'flight' || navigationTween.kind === 'pan') {
    camera.position.lerpVectors(navigationTween.fromCamera, navigationTween.toCamera, progress);
  }
  if (raw >= 1) {
    const wasFlight = navigationTween.kind === 'flight';
    if (navigationTween.focusObject) {
      focusedSystemObject = navigationTween.focusObject;
      focusedSystemObject.getWorldPosition(focusedWorldPosition);
      controls.target.copy(focusedWorldPosition);
    }
    navigationTween = null;
    if (wasFlight) {
      enterSystem();
    }
  }
}

function updateKeyboardNavigation(delta) {
  const horizontal = Number(pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight'))
    - Number(pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft'));
  const vertical = Number(pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp'))
    - Number(pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown'));

  if (horizontal === 0 && vertical === 0) {
    return;
  }

  navigationTween = null;
  focusedSystemObject = null;
  camera.updateMatrixWorld();
  navigationRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  navigationUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  navigationDirection
    .set(0, 0, 0)
    .addScaledVector(navigationRight, horizontal)
    .addScaledVector(navigationUp, vertical)
    .normalize();

  const distanceToCenter = camera.position.distanceTo(controls.target);
  const boost = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') ? 2.2 : 1;
  const speed = THREE.MathUtils.clamp(distanceToCenter * 0.72, 1.4, 28) * boost;
  const movement = navigationDirection.multiplyScalar(speed * delta);
  camera.position.add(movement);
  controls.target.add(movement);
}

function updateFocusedObject() {
  if (!focusedSystemObject || activeMode !== 'system' || navigationTween) {
    return;
  }
  const nextPosition = focusedSystemObject.getWorldPosition(new THREE.Vector3());
  camera.position.add(nextPosition.clone().sub(focusedWorldPosition));
  controls.target.copy(nextPosition);
  focusedWorldPosition.copy(nextPosition);
}

function updateProximity() {
  if (!selectedStar || activeMode !== 'galaxy') {
    return;
  }
  const distance = camera.position.distanceTo(selectedStar.position);
  const percent = Math.round(THREE.MathUtils.clamp((36 - distance) / 31, 0, 1) * 100);
  ui.proximityValue.textContent = `${percent}%`;
  ui.proximityProgress.style.width = `${percent}%`;
  ui.proximityLabel.textContent = percent > 76 ? 'Контур системы найден' : 'Сближение';
  if (distance < 5.35 && !navigationTween) {
    enterSystem();
  }
}

function clearSystem() {
  focusedSystemObject = null;
  orbitalBodies.length = 0;
  spinningBodies.length = 0;
  systemClickables.length = 0;
  while (systemGroup.children.length) {
    const object = systemGroup.children.pop();
    object.traverse?.((child) => {
      child.geometry?.dispose?.();
      if (child.material && child.material.map !== glowTexture) {
        child.material.map?.dispose?.();
      }
      child.material?.dispose?.();
      child.element?.remove?.();
    });
  }
}

function createOrbitLine(radius, color = 0x38515c, opacity = 0.28) {
  const points = [];
  for (let index = 0; index < 128; index += 1) {
    const angle = (index / 128) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  }));
}

function colorVariant(color, saturationOffset, lightnessOffset) {
  const value = new THREE.Color(color);
  const hsl = {};
  value.getHSL(hsl);
  value.setHSL(
    hsl.h,
    THREE.MathUtils.clamp(hsl.s + saturationOffset, 0, 1),
    THREE.MathUtils.clamp(hsl.l + lightnessOffset, 0, 1),
  );
  return `#${value.getHexString()}`;
}

function createPlanetTexture(color, random) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const surfaceType = Math.floor(random() * 4);
  const base = colorVariant(color, 0, -0.08);
  const light = colorVariant(color, 0.08, 0.16);
  const dark = colorVariant(color, 0.02, -0.2);

  const baseGradient = context.createLinearGradient(0, 0, 0, height);
  baseGradient.addColorStop(0, dark);
  baseGradient.addColorStop(0.48, base);
  baseGradient.addColorStop(1, colorVariant(color, -0.05, -0.16));
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, width, height);

  if (surfaceType === 0) {
    // Каменная поверхность: плато и кратеры.
    for (let index = 0; index < 34; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 2 + random() * 13;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = random() > 0.48 ? dark : light;
      context.globalAlpha = 0.12 + random() * 0.22;
      context.fill();
      context.strokeStyle = light;
      context.globalAlpha = 0.14;
      context.lineWidth = Math.max(1, radius * 0.12);
      context.stroke();
    }
  } else if (surfaceType === 1) {
    // Океанический мир: материки и облачность.
    context.globalAlpha = 0.58;
    for (let index = 0; index < 24; index += 1) {
      const x = random() * width;
      const y = random() * height;
      context.save();
      context.translate(x, y);
      context.rotate((random() - 0.5) * 1.1);
      context.scale(1.5 + random() * 2.2, 0.55 + random());
      context.beginPath();
      context.arc(0, 0, 5 + random() * 12, 0, Math.PI * 2);
      context.fillStyle = random() > 0.35 ? dark : light;
      context.fill();
      context.restore();
    }
    context.globalAlpha = 0.2;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    for (let index = 0; index < 13; index += 1) {
      const y = random() * height;
      context.beginPath();
      context.moveTo(-30, y);
      context.bezierCurveTo(width * 0.3, y - 12, width * 0.65, y + 13, width + 30, y - 3);
      context.stroke();
    }
  } else if (surfaceType === 2) {
    // Газовый гигант: полосы и атмосферный вихрь.
    for (let band = 0; band < 22; band += 1) {
      const y = (band / 22) * height;
      const bandHeight = 4 + random() * 12;
      context.fillStyle = band % 3 === 0 ? light : band % 2 === 0 ? dark : base;
      context.globalAlpha = 0.18 + random() * 0.24;
      context.beginPath();
      context.moveTo(0, y);
      for (let x = 0; x <= width; x += 16) {
        context.lineTo(x, y + Math.sin(x * 0.045 + band) * (2 + random() * 2));
      }
      context.lineTo(width, y + bandHeight);
      context.lineTo(0, y + bandHeight);
      context.closePath();
      context.fill();
    }
    context.globalAlpha = 0.32;
    context.fillStyle = light;
    context.beginPath();
    context.ellipse(
      width * (0.25 + random() * 0.5),
      height * (0.35 + random() * 0.3),
      24,
      7,
      -0.08,
      0,
      Math.PI * 2,
    );
    context.fill();
  } else {
    // Ледяной мир: светлые поля и разломы.
    context.globalAlpha = 0.3;
    context.fillStyle = '#d9f1f4';
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 0.4;
    context.strokeStyle = dark;
    context.lineWidth = 1;
    for (let index = 0; index < 28; index += 1) {
      let x = random() * width;
      let y = random() * height;
      context.beginPath();
      context.moveTo(x, y);
      for (let segment = 0; segment < 5; segment += 1) {
        x += (random() - 0.5) * 24;
        y += 4 + random() * 12;
        context.lineTo(x, y);
      }
      context.stroke();
    }
  }

  context.globalAlpha = 0.09;
  for (let index = 0; index < 1400; index += 1) {
    const tone = random() > 0.5 ? 255 : 0;
    context.fillStyle = `rgb(${tone} ${tone} ${tone})`;
    const grainSize = random() > 0.94 ? 2 : 1;
    context.fillRect(random() * width, random() * height, grainSize, grainSize);
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return { texture, surfaceType };
}

function createPlanetMaterial(color, random) {
  const { texture, surfaceType } = createPlanetTexture(color, random);
  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: surfaceType === 2 ? 0.68 : 0.82 + random() * 0.12,
    metalness: random() * 0.12,
  });
}

const DISCOVERIES = [
  'Минеральные жилы образуют геометрически точную сеть.',
  'В атмосфере обнаружены следы сложной органики.',
  'Под поверхностью работает неизвестный источник тепла.',
  'Зонд зарегистрировал руины автоматической станции.',
  'Магнитное поле хранит запись древней солнечной бури.',
  'На ночной стороне замечены периодические световые импульсы.',
  'Океан под ледяной корой остаётся геологически активным.',
  'Поверхность богата редкими изотопами для реактора корабля.',
];

function createScanInfo(star, kind, index, name, artifact = false) {
  const random = mulberry32(hashString(`${star.name}:${kind}:${index}`));
  const discovery = artifact
    ? 'В толще объекта найден фрагмент навигационного протокола. Его структура совпадает с неизвестным сигналом.'
    : DISCOVERIES[Math.floor(random() * DISCOVERIES.length)];
  return {
    id: `${star.name}:${kind}:${index}`,
    name,
    kindLabel: kind === 'planet' ? 'ПЛАНЕТА' : 'СПУТНИК',
    signal: artifact ? 'АНОМАЛИЯ · ВЫСОКИЙ ПРИОРИТЕТ' : random() > 0.56 ? 'СЛАБЫЙ СИГНАЛ' : 'ФОНОВОЕ ИЗЛУЧЕНИЕ',
    discovery,
    artifact,
    dataReward: artifact ? 24 : 7 + Math.floor(random() * 12),
    fuelReward: !artifact && random() > 0.76 ? 7 + Math.floor(random() * 9) : 0,
    probeReward: !artifact && random() > 0.86 ? 1 : 0,
  };
}

function scannedResult(info) {
  const bonuses = [];
  if (info.fuelReward) bonuses.push(`топливо +${info.fuelReward}`);
  if (info.probeReward) bonuses.push(`зонд +${info.probeReward}`);
  return `${info.discovery} Данные +${info.dataReward}${bonuses.length ? ` · ${bonuses.join(' · ')}` : ''}`;
}

function selectScanTarget(object) {
  const info = object.userData.scanInfo;
  activeScanTarget = info ? object : null;
  if (!info) {
    ui.scanPanel.classList.remove('visible');
    return;
  }
  ui.scanPanel.classList.add('visible');
  ui.scanName.textContent = info.name;
  ui.scanKind.textContent = info.kindLabel;
  ui.scanProgress.style.transition = 'none';
  ui.scanProgress.style.width = '0%';
  requestAnimationFrame(() => {
    ui.scanProgress.style.transition = '';
  });

  if (gameState.scanned.includes(info.id)) {
    ui.scanSignal.textContent = 'СКАНИРОВАНО';
    ui.scanResult.textContent = scannedResult(info);
    ui.scanButton.textContent = 'ДАННЫЕ ПОЛУЧЕНЫ';
    ui.scanButton.disabled = true;
  } else {
    ui.scanSignal.textContent = info.signal;
    ui.scanResult.textContent = info.artifact
      ? 'Сигнатура совпадает с фрагментом неизвестного протокола.'
      : 'Запустите зонд для анализа поверхности и атмосферы.';
    ui.scanButton.textContent = gameState.probes > 0
      ? 'ЗАПУСТИТЬ ЗОНД · 1'
      : gameState.data >= 18 ? 'СОБРАТЬ ЗОНД · 18 ДАННЫХ' : 'НЕДОСТАТОЧНО РЕСУРСОВ';
    ui.scanButton.disabled = (gameState.probes <= 0 && gameState.data < 18) || scanInProgress;
  }
}

function finishMission() {
  if (gameState.completed) return;
  gameState.completed = true;
  saveGameState();
  ui.completeSystems.textContent = gameState.visitedSystems.length;
  ui.completeData.textContent = gameState.data;
  setTimeout(() => ui.complete.classList.add('visible'), 650);
}

function scanActiveTarget() {
  const object = activeScanTarget;
  const info = object?.userData.scanInfo;
  if (!info || scanInProgress || gameState.scanned.includes(info.id)) return;
  if (gameState.probes <= 0) {
    if (gameState.data < 18) {
      showToast('Недостаточно данных для сборки нового зонда');
      return;
    }
    gameState.data -= 18;
    gameState.probes += 1;
    showToast('Бортовой фабрикатор собрал новый зонд');
  }

  scanInProgress = true;
  gameState.probes -= 1;
  updateGameUI();
  saveGameState();
  ui.scanButton.disabled = true;
  ui.scanButton.textContent = 'СКАНИРОВАНИЕ…';
  ui.scanResult.textContent = 'Зонд вышел на орбиту. Идёт спектральный анализ…';
  ui.scanProgress.style.width = '100%';

  setTimeout(() => {
    gameState.scanned.push(info.id);
    gameState.data += info.dataReward;
    gameState.fuel = Math.min(120, gameState.fuel + info.fuelReward);
    gameState.probes += info.probeReward;
    if (info.artifact) gameState.fragments = Math.min(3, gameState.fragments + 1);
    scanInProgress = false;
    saveGameState();
    updateGameUI();
    if (activeMode === 'system' && activeScanTarget === object) {
      selectScanTarget(object);
    }
    showToast(info.artifact ? `Фрагмент сигнала ${gameState.fragments}/3 восстановлен` : `Исследование завершено · данные +${info.dataReward}`);
    if (gameState.fragments >= 3) finishMission();
  }, 1550);
}

function buildSystem(star) {
  clearSystem();
  const random = mulberry32(hashString(star.name));
  const planetCount = star.planetCount;
  const anomalyPlanetIndex = hashString(`${star.name}:anomaly`) % planetCount;
  let moonCount = 0;

  const ambient = new THREE.AmbientLight(0x7794aa, 0.18);
  const sunLight = new THREE.PointLight(star.type.color, 72, 90, 1.45);
  systemGroup.add(ambient, sunLight);

  const sunSize = 1.05 + random() * 0.55;
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(sunSize, 64, 64),
    new THREE.MeshStandardMaterial({
      color: star.type.color,
      emissive: star.type.color,
      emissiveIntensity: 4.2,
      roughness: 0.9,
    }),
  );
  sun.userData = {
    kind: 'sun',
    name: star.name,
  };
  sun.add(makeLabel(star.name.toUpperCase(), 'system-label sun-label'));
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: star.type.color,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(sunSize * 6.4);
  sun.add(halo);
  systemGroup.add(sun);
  systemClickables.push(sun);

  let orbitRadius = 3.1 + sunSize;
  for (let index = 0; index < planetCount; index += 1) {
    const size = 0.17 + random() * 0.48;
    orbitRadius += 1.75 + random() * 1.65 + size;
    const pivot = new THREE.Group();
    pivot.rotation.y = random() * Math.PI * 2;
    pivot.rotation.x = (random() - 0.5) * 0.18;

    const orbit = createOrbitLine(orbitRadius);
    orbit.rotation.x = pivot.rotation.x;
    systemGroup.add(orbit);

    const carrier = new THREE.Group();
    carrier.position.x = orbitRadius;
    pivot.add(carrier);

    const planetName = `${star.name.split(' ')[0]} ${roman[index]}`;
    const carriesArtifact = index === anomalyPlanetIndex;
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(size, 32, 32),
      createPlanetMaterial(planetPalette[Math.floor(random() * planetPalette.length)], random),
    );
    planet.rotation.z = (random() - 0.5) * 0.55;
    planet.userData = {
      kind: 'planet',
      name: planetName,
      scanInfo: createScanInfo(star, 'planet', index, planetName, carriesArtifact),
    };
    const planetLabel = makeLabel(`${planetName.toUpperCase()}${carriesArtifact ? '  ◇' : ''}`, 'system-label');
    planetLabel.position.set(size * 1.25, size * 0.85, 0);
    planet.add(planetLabel);
    carrier.add(planet);
    systemClickables.push(planet);
    spinningBodies.push({
      object: planet,
      speed: 0.08 + random() * 0.22,
    });

    if (size > 0.4 && random() > 0.52) {
      const ringGeometry = new THREE.RingGeometry(size * 1.45, size * 2.25, 64);
      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xa6b7b8,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2.35;
      planet.add(ring);
    }

    const moonsForPlanet = random() > 0.46 ? Math.floor(random() * 3) + 1 : 0;
    for (let moonIndex = 0; moonIndex < moonsForPlanet; moonIndex += 1) {
      moonCount += 1;
      const moonPivot = new THREE.Group();
      moonPivot.rotation.y = random() * Math.PI * 2;
      moonPivot.rotation.z = (random() - 0.5) * 0.25;
      const moonRadius = size * (2.8 + moonIndex * 1.35);
      const moonSize = Math.max(0.055, size * (0.13 + random() * 0.14));
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(moonSize, 18, 18),
        new THREE.MeshStandardMaterial({
          color: 0xaab0b3,
          roughness: 0.95,
        }),
      );
      moon.position.x = moonRadius;
      const moonName = `${planetName} · ${String.fromCharCode(97 + moonIndex)}`;
      moon.userData = {
        kind: 'moon',
        name: moonName,
        scanInfo: createScanInfo(star, 'moon', `${index}-${moonIndex}`, moonName),
      };
      const moonLabel = makeLabel(moonName, 'system-label');
      moonLabel.position.set(size * 0.3, size * 0.22, 0);
      moon.add(moonLabel);
      const moonHitTarget = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.24, moonSize * 3.4), 12, 12),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          colorWrite: false,
        }),
      );
      moonHitTarget.userData = {
        kind: 'moon-hit-target',
        focusTarget: moon,
      };
      moon.add(moonHitTarget);
      moonPivot.add(moon);
      carrier.add(moonPivot);
      systemClickables.push(moonHitTarget);
      spinningBodies.push({
        object: moon,
        speed: 0.18 + random() * 0.28,
      });
      orbitalBodies.push({
        pivot: moonPivot,
        speed: 0.32 + random() * 0.62,
      });
    }

    systemGroup.add(pivot);
    orbitalBodies.push({
      pivot,
      speed: 0.022 + (planetCount - index) * 0.007 + random() * 0.018,
    });
  }

  ui.systemName.textContent = star.name;
  ui.systemDescription.textContent = `${star.type.label}, спектральный класс ${star.type.type}. Орбитальные параметры восстановлены по дальнему сканированию.`;
  ui.planetCount.textContent = planetCount;
  ui.moonCount.textContent = moonCount;
}

function enterSystem() {
  if (!selectedStar || transitionLocked || activeMode !== 'galaxy') {
    return;
  }
  const travelCost = routeCost(selectedStar);
  if (gameState.fuel < travelCost) {
    const direction = camera.position.clone().sub(selectedStar.position).normalize();
    controls.target.copy(selectedStar.position);
    camera.position.copy(selectedStar.position).add(direction.multiplyScalar(STAR_FOCUS_DISTANCE));
    showToast(`Прыжок невозможен: требуется ${travelCost} топлива`);
    return;
  }
  if (travelCost > 0) {
    gameState.fuel -= travelCost;
    gameState.currentLocation = selectedStar.name;
  }
  if (!gameState.visitedSystems.includes(selectedStar.name)) {
    gameState.visitedSystems.push(selectedStar.name);
  }
  saveGameState();
  updateGameUI();
  transitionLocked = true;
  ui.curtain.classList.add('visible');
  setTimeout(() => {
    buildSystem(selectedStar);
    activeMode = 'system';
    focusedSystemObject = null;
    activeScanTarget = null;
    ui.scanPanel.classList.remove('visible');
    galaxyGroup.visible = false;
    systemGroup.visible = true;
    app.classList.add('system-mode');
    ui.systemPanel.classList.add('visible');
    ui.mode.textContent = 'ОРБИТАЛЬНЫЙ РЕЖИМ';
    camera.position.set(0, 9.5, 20);
    controls.target.set(0, 0, 0);
    controls.minDistance = 3.2;
    controls.maxDistance = Math.max(28, 6 + selectedStar.planetCount * 4.6);
    scene.fog.density = 0.0025;
    ui.curtain.classList.remove('visible');
    showToast(travelCost > 0 ? `Прыжок завершён · топливо −${travelCost}` : 'Возвращение в исследованную систему');
    setTimeout(() => {
      transitionLocked = false;
    }, 320);
  }, 310);
}

function leaveSystem() {
  if (transitionLocked || activeMode !== 'system') {
    return;
  }
  transitionLocked = true;
  ui.curtain.classList.add('visible');
  setTimeout(() => {
    activeMode = 'galaxy';
    focusedSystemObject = null;
    activeScanTarget = null;
    ui.scanPanel.classList.remove('visible');
    systemGroup.visible = false;
    galaxyGroup.visible = true;
    app.classList.remove('system-mode');
    ui.systemPanel.classList.remove('visible');
    ui.mode.textContent = 'КАРТА СЕКТОРА';
    const direction = new THREE.Vector3(0.75, 0.34, 1).normalize();
    controls.target.copy(selectedStar.position);
    camera.position.copy(selectedStar.position).add(direction.multiplyScalar(STAR_FOCUS_DISTANCE));
    controls.minDistance = 4.5;
    controls.maxDistance = 105;
    scene.fog.density = 0.0055;
    updateRouteButton();
    ui.curtain.classList.remove('visible');
    setTimeout(() => {
      transitionLocked = false;
    }, 320);
  }, 310);
}

function updateSystemZoomExit() {
  if (activeMode !== 'system' || transitionLocked || navigationTween) {
    return;
  }
  const distanceToFocus = camera.position.distanceTo(controls.target);
  if (distanceToFocus >= controls.maxDistance * 0.94) {
    leaveSystem();
  }
}

function updateLabels() {
  if (activeMode !== 'galaxy') {
    return;
  }
  for (const star of galaxyStars) {
    const distance = camera.position.distanceTo(star.position);
    const visible = star === selectedStar || star.label.userData.major || distance < 22;
    const opacity = star === selectedStar ? 1 : THREE.MathUtils.clamp((32 - distance) / 15, 0.18, 0.82);
    star.label.visible = visible;
    star.label.userData.element.style.opacity = String(opacity);
  }
}

function updateCoordinates() {
  const vector = activeMode === 'galaxy' ? camera.position : controls.target;
  const format = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1).padStart(4, '0')}`;
  ui.coordinates.innerHTML = `X ${format(vector.x)}&nbsp;&nbsp; Y ${format(vector.y)}&nbsp;&nbsp; Z ${format(vector.z)}`;
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  updateNavigation(now);
  updateKeyboardNavigation(delta);
  controls.update();
  updateSystemZoomExit();
  updateProximity();
  updateLabels();
  updateCoordinates();

  if (activeMode === 'system') {
    const orbitalDelta = delta * SYSTEM_TIME_SCALE;
    for (const body of orbitalBodies) {
      body.pivot.rotation.y += body.speed * orbitalDelta;
    }
    for (const body of spinningBodies) {
      body.object.rotation.y += body.speed * orbitalDelta;
    }
    updateFocusedObject();
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = {
    x: event.clientX,
    y: event.clientY,
  };
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerDown) {
    return;
  }
  const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  if (distance < 5) {
    pickObject(event);
  }
  pointerDown = null;
});

renderer.domElement.addEventListener('pointermove', (event) => pickObject(event, true));
renderer.domElement.addEventListener('dblclick', () => startFlight());
ui.fly.addEventListener('click', startFlight);
ui.back.addEventListener('click', leaveSystem);
ui.scanButton.addEventListener('click', scanActiveTarget);
ui.continueButton.addEventListener('click', () => ui.complete.classList.remove('visible'));
$('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  if (activeMode === 'system') {
    leaveSystem();
  }
});

addEventListener('keydown', (event) => {
  const navigationCodes = [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ShiftLeft',
    'ShiftRight',
  ];
  if (navigationCodes.includes(event.code)) {
    pressedKeys.add(event.code);
    event.preventDefault();
  }
  if (event.key === 'Enter') {
    startFlight();
  }
  if (event.key === 'Escape') {
    leaveSystem();
  }
});

addEventListener('keyup', (event) => {
  pressedKeys.delete(event.code);
});

addEventListener('blur', () => {
  pressedKeys.clear();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  labelRenderer.setSize(innerWidth, innerHeight);
});

createBackgroundField();
createSectorGrid();
createGalaxy();
updateGameUI();
animate(performance.now());

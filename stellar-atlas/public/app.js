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
  back: $('#back-button'),
  mode: $('#mode-label'),
  coordinates: $('#coordinates'),
  systemPanel: $('#system-panel'),
  systemName: $('#system-name'),
  systemDescription: $('#system-description'),
  planetCount: $('#planet-count'),
  moonCount: $('#moon-count'),
  curtain: $('#transition-curtain'),
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

const galaxyGroup = new THREE.Group();
const systemGroup = new THREE.Group();
systemGroup.visible = false;
scene.add(galaxyGroup, systemGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const galaxyStars = [];
const clickableStars = [];
const orbitalBodies = [];
const systemClickables = [];
let selectedStar = null;
let activeMode = 'galaxy';
let navigationTween = null;
let transitionLocked = false;
let pointerDown = null;

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
  if (!moveOnly && hits.length && activeMode === 'galaxy') {
    selectStar(hits[0].object);
  }
}

function selectStar(sprite) {
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
  ui.fly.disabled = false;

  const from = controls.target.clone();
  const to = selectedStar.position.clone();
  navigationTween = {
    kind: 'target',
    started: performance.now(),
    duration: 720,
    fromTarget: from,
    toTarget: to,
  };
}

function startFlight() {
  if (!selectedStar || transitionLocked || activeMode !== 'galaxy') {
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
  if (navigationTween.kind === 'flight') {
    camera.position.lerpVectors(navigationTween.fromCamera, navigationTween.toCamera, progress);
  }
  if (raw >= 1) {
    const wasFlight = navigationTween.kind === 'flight';
    navigationTween = null;
    if (wasFlight) {
      enterSystem();
    }
  }
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
  orbitalBodies.length = 0;
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

function createPlanetMaterial(color, random) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72 + random() * 0.2,
    metalness: random() * 0.12,
  });
}

function buildSystem(star) {
  clearSystem();
  const random = mulberry32(hashString(star.name));
  const planetCount = star.planetCount;
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
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(size, 32, 32),
      createPlanetMaterial(planetPalette[Math.floor(random() * planetPalette.length)], random),
    );
    planet.rotation.z = (random() - 0.5) * 0.55;
    planet.userData = {
      kind: 'planet',
      name: planetName,
    };
    const planetLabel = makeLabel(planetName.toUpperCase(), 'system-label');
    planetLabel.position.set(size * 1.25, size * 0.85, 0);
    planet.add(planetLabel);
    carrier.add(planet);
    systemClickables.push(planet);

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
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.055, size * (0.13 + random() * 0.14)), 18, 18),
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
      };
      const moonLabel = makeLabel(moonName, 'system-label');
      moonLabel.position.set(size * 0.3, size * 0.22, 0);
      moon.add(moonLabel);
      moonPivot.add(moon);
      carrier.add(moonPivot);
      systemClickables.push(moon);
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
  transitionLocked = true;
  ui.curtain.classList.add('visible');
  setTimeout(() => {
    buildSystem(selectedStar);
    activeMode = 'system';
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
    systemGroup.visible = false;
    galaxyGroup.visible = true;
    app.classList.remove('system-mode');
    ui.systemPanel.classList.remove('visible');
    ui.mode.textContent = 'КАРТА СЕКТОРА';
    const direction = new THREE.Vector3(0.75, 0.34, 1).normalize();
    controls.target.copy(selectedStar.position);
    camera.position.copy(selectedStar.position).add(direction.multiplyScalar(17));
    controls.minDistance = 4.5;
    controls.maxDistance = 105;
    scene.fog.density = 0.0055;
    ui.curtain.classList.remove('visible');
    setTimeout(() => {
      transitionLocked = false;
    }, 320);
  }, 310);
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
  controls.update();
  updateProximity();
  updateLabels();
  updateCoordinates();

  if (activeMode === 'system') {
    for (const body of orbitalBodies) {
      body.pivot.rotation.y += body.speed * delta;
    }
  } else {
    galaxyGroup.rotation.y += 0.000035;
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
$('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  if (activeMode === 'system') {
    leaveSystem();
  }
});

addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    startFlight();
  }
  if (event.key === 'Escape') {
    leaveSystem();
  }
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
animate(performance.now());

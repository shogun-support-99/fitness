#!/usr/bin/env node
/**
 * Build the IronLog hero mascot as a committed GLB.
 *
 * "Kettle" is a glossy kettlebell buddy: a lathed bell body, a forest-green
 * handle with a chalked grip, a cream sweatband, big toy eyes, mitten gloves
 * and chunky sneakers. Everything is drawn from smooth primitives so the
 * character is original, offline and free of third-party model licences.
 *
 * Rig groups the runtime animates:
 *   Body     – feet, legs and the whole upper body (bob / lean)
 *   Head     – the bell, face, headband, handle and arms (look-at rotation)
 *   ArmWave  – the waving arm, pivoted at its shoulder
 *
 * Usage: node scripts/build-spotter-glb.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// GLTFExporter reads the finished GLB through FileReader. Node has Blob but
// not FileReader, so provide the tiny slice the exporter actually uses.
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  };
}

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const HEAD_Y = 0.3;

const palette = {
  bell: 0xf3d314,
  bellShade: 0xe0bd0c,
  forest: 0x16392a,
  cream: 0xf7f1e1,
  eye: 0x14201c,
  mouth: 0x522b29,
  tongue: 0xef8f8c,
  blush: 0xf3a195,
};

const materials = {
  bell: new THREE.MeshPhysicalMaterial({
    name: "Kettlebell enamel",
    color: palette.bell,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.22,
  }),
  bellShade: new THREE.MeshStandardMaterial({
    name: "Kettlebell nose",
    color: palette.bellShade,
    roughness: 0.5,
  }),
  forest: new THREE.MeshPhysicalMaterial({
    name: "Forest rubber",
    color: palette.forest,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
  }),
  cream: new THREE.MeshStandardMaterial({
    name: "Cream cotton",
    color: palette.cream,
    roughness: 0.62,
    metalness: 0,
  }),
  creamGloss: new THREE.MeshPhysicalMaterial({
    name: "Cream glove",
    color: palette.cream,
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
  }),
  eye: new THREE.MeshPhysicalMaterial({
    name: "Toy eye",
    color: palette.eye,
    roughness: 0.1,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  }),
  glint: new THREE.MeshStandardMaterial({
    name: "Eye catchlight",
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.3,
    roughness: 0.25,
  }),
  mouth: new THREE.MeshStandardMaterial({
    name: "Mouth",
    color: palette.mouth,
    roughness: 0.7,
  }),
  tongue: new THREE.MeshStandardMaterial({
    name: "Tongue",
    color: palette.tongue,
    roughness: 0.62,
  }),
  blush: new THREE.MeshStandardMaterial({
    name: "Blush",
    color: palette.blush,
    roughness: 0.92,
  }),
};

// The mascot renders at roughly 160–260 px tall, so these counts are still
// smooth at hero size while keeping the committed GLB small.
const sphere = (radius = 1, detail = 24) =>
  new THREE.SphereGeometry(radius, detail, Math.round(detail * 0.7));

const capsule = (radius, length) =>
  new THREE.CapsuleGeometry(radius, Math.max(length, 0.001), 8, 20);

const torus = (radius, tube, radial = 12, tubular = 48, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(radius, tube, radial, tubular, arc);

function add(parent, geometry, material, options = {}) {
  const {
    name,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
  } = options;
  const mesh = new THREE.Mesh(geometry, material);
  if (name) mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBetween(parent, from, to, radius, material, options = {}) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const mesh = add(parent, capsule(radius, length - radius * 2), material, {
    ...options,
    position: start.clone().add(end).multiplyScalar(0.5).toArray(),
  });
  mesh.quaternion.setFromUnitVectors(Y, direction.normalize());
  return mesh;
}

function addRing(parent, radius, tube, material, options = {}) {
  const mesh = add(parent, torus(radius, tube), material, options);
  mesh.rotation.x = Math.PI / 2;
  if (options.scale) mesh.scale.set(...options.scale);
  return mesh;
}

function addTorusAxis(parent, radius, tube, axis, material, options = {}) {
  const mesh = add(parent, torus(radius, tube), material, options);
  mesh.quaternion.setFromUnitVectors(Z, new THREE.Vector3(...axis).normalize());
  return mesh;
}

function buildMascot() {
  const root = new THREE.Group();
  root.name = "Spotter";

  /* ── Body: feet, legs, and the upper-body pivot ───────────────────────── */

  const body = new THREE.Group();
  body.name = "Body";
  root.add(body);

  for (const side of [-1, 1]) {
    const sx = side * 0.19;
    const suffix = side < 0 ? "L" : "R";

    add(body, capsule(0.075, 0.09), materials.bell, {
      name: `Leg${suffix}`,
      position: [sx, 0.26, 0.04],
    });

    // Chunky crew socks keep the little legs readable at card size.
    add(body, new THREE.CylinderGeometry(0.094, 0.098, 0.13, 18), materials.cream, {
      name: `Sock${suffix}`,
      position: [sx, 0.19, 0.04],
    });
    add(body, new THREE.CylinderGeometry(0.097, 0.099, 0.024, 18), materials.forest, {
      name: `SockStripe${suffix}`,
      position: [sx, 0.228, 0.04],
    });

    const shoeYaw = side * 0.09;
    // Chunky sneaker: thick sole + chunky upper + toe cap, reads at card size.
    add(body, new RoundedBoxGeometry(0.235, 0.075, 0.38, 3, 0.03), materials.forest, {
      name: `Sole${suffix}`,
      position: [sx, 0.033, 0.12],
      rotation: [0, shoeYaw, 0],
    });
    add(body, new RoundedBoxGeometry(0.215, 0.15, 0.345, 3, 0.062), materials.creamGloss, {
      name: `Shoe${suffix}`,
      position: [sx, 0.115, 0.125],
      rotation: [0, shoeYaw, 0],
    });
    add(body, new RoundedBoxGeometry(0.205, 0.1, 0.315, 3, 0.042), materials.forest, {
      name: `ToeCap${suffix}`,
      position: [sx, 0.178, 0.275],
      rotation: [0, shoeYaw, 0],
    });
    add(body, new RoundedBoxGeometry(0.175, 0.026, 0.295, 2, 0.02), materials.bellShade, {
      name: `Stripe${suffix}`,
      position: [sx, 0.208, 0.155],
      rotation: [0, shoeYaw, 0],
    });

    for (let i = 0; i < 3; i += 1) {
      add(body, new THREE.CylinderGeometry(0.009, 0.009, 0.11, 6), materials.bellShade, {
        name: `Lace${suffix}${i + 1}`,
        position: [sx, 0.196 - i * 0.005, 0.075 + i * 0.065],
        rotation: [0, shoeYaw, Math.PI / 2],
      });
    }
  }

  // The whole bell is the head. It pivots at its base so mouse-look tilts the
  // toy without moving the planted feet.
  const head = new THREE.Group();
  head.name = "Head";
  head.position.set(0, HEAD_Y, 0);
  body.add(head);

  /* ── Bell body ────────────────────────────────────────────────────────── */

  const profile = new THREE.SplineCurve(
    [
      [0.0, 0.0],
      [0.26, 0.0],
      [0.4, 0.018],
      [0.5, 0.06],
      [0.575, 0.13],
      [0.62, 0.23],
      [0.632, 0.35],
      [0.628, 0.47],
      [0.606, 0.59],
      [0.565, 0.71],
      [0.505, 0.82],
      [0.425, 0.915],
      [0.325, 0.99],
      [0.2, 1.05],
      [0.09, 1.085],
      [0.0, 1.095],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  )
    .getPoints(48)
    .map((point) => new THREE.Vector2(Math.max(0, point.x), Math.max(0, Math.min(1.095, point.y))));

  add(head, new THREE.LatheGeometry(profile, 56), materials.bell, {
    name: "Bell",
  });

  addRing(head, 0.494, 0.019, materials.forest, {
    name: "BaseBumper",
    position: [0, 0.058, 0],
  });

  /* ── Handle + chalked grip ────────────────────────────────────────────── */

  const handleY = 1.22;
  const handleR = 0.285;
  const handleTube = 0.062;

  add(head, torus(handleR, handleTube, 14, 56), materials.forest, {
    name: "Handle",
    position: [0, handleY, 0],
    scale: [1, 1, 0.68],
  });

  const gripArc = Math.PI * 0.46;
  const gripRotation = Math.PI / 2 - gripArc / 2;
  add(head, torus(handleR + 0.002, 0.069, 12, 32, gripArc), materials.cream, {
    name: "HandleGrip",
    position: [0, handleY, 0],
    rotation: [0, 0, gripRotation],
    scale: [1, 1, 0.68],
  });

  for (const angle of [gripRotation, gripRotation + gripArc]) {
    add(head, sphere(0.068, 14), materials.cream, {
      name: "HandleGripEnd",
      position: [Math.cos(angle) * handleR, handleY + Math.sin(angle) * handleR, 0],
      scale: [1, 1, 0.68],
    });
  }

  /* ── Sweatband ────────────────────────────────────────────────────────── */

  addRing(head, 0.41, 0.045, materials.cream, {
    name: "Headband",
    position: [0, 0.94, 0],
  });
  addRing(head, 0.452, 0.012, materials.forest, {
    name: "HeadbandStripe",
    position: [0, 0.94, 0],
  });

  add(head, sphere(0.052, 14), materials.forest, {
    name: "HeadbandKnot",
    position: [0.07, 0.935, -0.405],
    scale: [1, 0.9, 0.7],
  });

  for (const side of [-1, 1]) {
    add(head, new RoundedBoxGeometry(0.065, 0.22, 0.018, 2, 0.022), materials.forest, {
      name: side < 0 ? "HeadbandTailL" : "HeadbandTailR",
      position: [0.07 + side * 0.055, 0.845, -0.43],
      rotation: [-0.3, side * 0.35, side * 0.25],
    });
  }

  /* ── Face ─────────────────────────────────────────────────────────────── */

  for (const side of [-1, 1]) {
    const ex = side * 0.215;
    const suffix = side < 0 ? "L" : "R";

    add(head, sphere(1, 28), materials.eye, {
      name: `Eye${suffix}`,
      position: [ex, 0.65, 0.55],
      scale: [0.055, 0.065, 0.04],
    });

    add(head, sphere(0.042, 16), materials.glint, {
      name: `Glint${suffix}1`,
      position: [ex - 0.046, 0.677, 0.603],
      scale: [1, 1, 0.52],
    });

    add(head, sphere(0.019, 12), materials.glint, {
      name: `Glint${suffix}2`,
      position: [ex + 0.045, 0.598, 0.605],
      scale: [1, 1, 0.5],
    });
  }

  add(head, sphere(1, 14), materials.bellShade, {
    name: "Nose",
    position: [0, 0.535, 0.608],
    scale: [0.028, 0.022, 0.014],
  });

  add(head, new THREE.CircleGeometry(0.106, 32, Math.PI, Math.PI), materials.mouth, {
    name: "Mouth",
    position: [0, 0.43, 0.63],
    scale: [1, 0.9, 1],
  });
  add(head, new THREE.CircleGeometry(0.065, 24, Math.PI, Math.PI), materials.tongue, {
    name: "Tongue",
    position: [0, 0.405, 0.632],
    scale: [1, 0.65, 1],
  });
  add(head, new RoundedBoxGeometry(0.046, 0.028, 0.014, 2, 0.007), materials.cream, {
    name: "Tooth",
    position: [0, 0.429, 0.634],
  });

  for (const side of [-1, 1]) {
    add(head, sphere(1, 20), materials.blush, {
      name: side < 0 ? "BlushL" : "BlushR",
      position: [side * 0.355, 0.5, 0.508],
      rotation: [0, side * 0.72, 0],
      scale: [0.112, 0.062, 0.022],
    });
  }

  /* ── Arms ─────────────────────────────────────────────────────────────── */

  // Waving arm: attached below eye level so it reads as an arm, not an antenna.
  const armWave = new THREE.Group();
  armWave.name = "ArmWave";
  armWave.position.set(0.6, 0.52, 0.03);
  head.add(armWave);

  const waveElbow = new THREE.Vector3(0.115, 0.1, 0.03);
  const waveWrist = new THREE.Vector3(0.205, 0.28, 0.035);
  const waveHand = new THREE.Vector3(0.225, 0.335, 0.035);

  add(armWave, sphere(0.09, 20), materials.bell, {
    name: "ShoulderWave",
    scale: [1, 1, 0.9],
  });
  addBetween(armWave, [0, 0, 0], waveElbow.toArray(), 0.073, materials.bell, {
    name: "ArmWaveUpper",
  });
  add(armWave, sphere(0.076, 14), materials.bell, {
    name: "ElbowWave",
    position: waveElbow.toArray(),
  });
  addBetween(armWave, waveElbow.toArray(), waveWrist.toArray(), 0.067, materials.bell, {
    name: "ArmWaveFore",
  });

  // Mitten hands (Berd/Jamm toy language): a rounded-box palm with a cuff.
  // Helper placed just above its call sites.
  function addMitten(parent, palmPos, cuffPos, cuffAxis, scale, nameBase) {
    const palm = add(parent, new RoundedBoxGeometry(0.095, 0.115, 0.055, 3, 0.04), materials.creamGloss, {
      name: `${nameBase}Palm`,
      position: palmPos,
      scale,
    });
    add(parent, new RoundedBoxGeometry(0.078, 0.098, 0.045, 2, 0.035), materials.creamGloss, {
      name: `${nameBase}Thumb`,
      position: [
        palmPos[0] + cuffAxis[0] * 0.035,
        palmPos[1] + cuffAxis[1] * 0.035 - 0.012,
        palmPos[2] + cuffAxis[2] * 0.035 + 0.018,
      ],
      scale: [0.85, 0.9, 0.8],
    });
    add(parent, torus(0.072, 0.016, 10, 24), materials.forest, {
      name: `${nameBase}Cuff`,
      position: cuffPos,
    }).quaternion.setFromUnitVectors(Z, new THREE.Vector3(...cuffAxis).normalize());
  }

  addMitten(
    armWave,
    waveHand.toArray(),
    waveWrist.toArray(),
    waveWrist.clone().sub(waveElbow).normalize().toArray(),
    [0.96, 1.04, 0.92],
    "Wave",
  );

  // Flexing arm: shoulder → elbow → fist, wrapped in its own group so the
  // runtime can rotate it as a unit (flex on click/hover).
  const armFlex = new THREE.Group();
  armFlex.name = "ArmFlex";
  armFlex.position.set(0, 0, 0);
  head.add(armFlex);

  const shoulder = [-0.6, 0.52, 0.03];
  const elbow = [-0.785, 0.565, 0.075];
  const wrist = [-0.765, 0.755, 0.06];
  const fist = [-0.755, 0.82, 0.06];

  addMitten(
    armFlex,
    fist,
    wrist,
    new THREE.Vector3(...wrist).sub(new THREE.Vector3(...elbow)).normalize().toArray(),
    [0.96, 1, 0.92],
    "Flex",
  );

  add(armFlex, sphere(0.09, 20), materials.bell, {
    name: "ShoulderFlex",
    position: shoulder,
    scale: [1, 1, 0.9],
  });
  addBetween(armFlex, shoulder, elbow, 0.073, materials.bell, {
    name: "ArmFlexUpper",
  });
  add(armFlex, sphere(0.076, 14), materials.bell, {
    name: "ElbowFlex",
    position: elbow,
  });
  addBetween(armFlex, elbow, wrist, 0.067, materials.bell, {
    name: "ArmFlexFore",
  });

  const flexDir = new THREE.Vector3(...wrist).sub(new THREE.Vector3(...elbow)).normalize();
  const flexBand = new THREE.Vector3(...elbow).lerp(new THREE.Vector3(...wrist), 0.78);
  addTorusAxis(armFlex, 0.08, 0.024, flexDir.toArray(), materials.forest, {
    name: "WristbandFlex",
    position: flexBand.toArray(),
  });
  addTorusAxis(armFlex, 0.081, 0.009, flexDir.toArray(), materials.cream, {
    name: "WristbandFlexStripe",
    position: flexBand.clone().add(flexDir.clone().multiplyScalar(0.019)).toArray(),
  });

  return root;
}

const root = buildMascot();

// Nothing is texture-mapped, so UVs and tangents are dead weight in the GLB.
root.traverse((node) => {
  if (!node.isMesh) return;
  const geometry = node.geometry;
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal") {
      geometry.deleteAttribute(attribute);
    }
  }
});

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(root, {
  binary: true,
  onlyVisible: true,
  truncateDrawRange: true,
});

const output = resolve(import.meta.dirname, "..", "assets", "models", "spotter.glb");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.from(glb));

const box = new THREE.Box3().setFromObject(root);
const size = box.getSize(new THREE.Vector3());
const bytes = Buffer.byteLength(Buffer.from(glb));
console.log(`Wrote ${output} (${(bytes / 1024).toFixed(1)} KB)`);
console.log(`Bounds: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} units`);
console.log(`Rig groups: ${["Body", "Head", "ArmWave"].map((name) => (root.getObjectByName(name) ? name : `missing ${name}`)).join(", ")}`);

let parts = 0;
root.traverse((node) => {
  if (node.isMesh) parts += 1;
});
console.log(`Meshes: ${parts}`);

import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const buffer = await readFile(new URL("../assets/models/spotter.glb", import.meta.url));
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(
  arrayBuffer,
  "",
  (gltf) => {
    const root = gltf.scene;
    const rows = [];
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      if (!node.isMesh) return;
      const box = new THREE.Box3().setFromObject(node);
      rows.push({
        name: node.name,
        minY: +box.min.y.toFixed(3),
        maxY: +box.max.y.toFixed(3),
        x: +(box.max.x - box.min.x).toFixed(3),
        z: +(box.max.z - box.min.z).toFixed(3),
        material: node.material?.name,
        p: node.position.toArray().map((v) => +v.toFixed(3)),
        r: [node.rotation.x, node.rotation.y, node.rotation.z].map((v) => +v.toFixed(3)),
        s: node.scale.toArray().map((v) => +v.toFixed(3)),
      });
    });
    rows.sort((a, b) => b.maxY - a.maxY);
    console.log(rows.slice(0, 8));
    console.log("groups:", ["Body", "Head", "ArmWave"].map((n) => `${n}:${!!root.getObjectByName(n)}`).join(" "));
  },
  (error) => {
    console.error("parse failed", error);
    process.exitCode = 1;
  },
);

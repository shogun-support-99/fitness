import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Box3,
  LinearSRGBColorSpace,
  MathUtils,
  PCFShadowMap,
  PMREMGenerator,
  SRGBColorSpace,
  Sphere,
  Timer,
  Vector3,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

/**
 * Hero assets are resolved from the built bundle's URL so the same file works
 * at `/` locally and `/fitness/` on GitHub Pages.
 */
const MODEL_URL = new URL("../models/golem.glb", import.meta.url).href;
const HDR_URL = new URL("../models/potsdamer_platz_1k.hdr", import.meta.url).href;

/** Normalised world height of the character. */
const TARGET_HEIGHT = 1.8;
/** Orbit limit used when reserving horizontal room for the silhouette. */
const MAX_AZIMUTH = 0.42;
/** Breathing space around the model before the card edge. The extra room on
 *  top of the silhouette lets a raised pointing arm stay inside the card. */
const CAMERA_MARGIN = 1.16;

/** Keep a failed HDR / model from taking the whole hero down with it. */
class SilentBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn("[IronLog] Hero scene asset unavailable.", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * WebGL resources owned by the loaded GLB. Everything is disposed together so
 * a remount never leaks geometry, materials or 2048px textures.
 */
function disposeObject(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    if (!node.material) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && value.isTexture) textures.add(value);
      }
    }
  });

  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

/**
 * Manual GLTFLoader (instead of useLoader) so textures decoded from the GLB's
 * embedded WebP buffer views belong to this component and can be disposed.
 * `useLoader.preload` is deliberately absent: it suspends forever in the
 * committed bundle and the hero never becomes ready.
 */
function useGltf(url) {
  const [gltf, setGltf] = useState(null);

  useEffect(() => {
    let live = true;
    const loader = new GLTFLoader();

    loader.load(
      url,
      (result) => {
        if (live) setGltf(result);
        else disposeObject(result.scene);
      },
      undefined,
      (error) => {
        console.warn("[IronLog] Hero character failed to load.", error);
      },
    );

    return () => {
      live = false;
    };
  }, [url]);

  return gltf;
}

/** Normalise the authored mesh: uniform scale to TARGET_HEIGHT, feet at y=0. */
function prepareGolem(gltf) {
  if (!gltf) return null;

  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const rawBox = new Box3().setFromObject(scene);
  const rawSize = rawBox.getSize(new Vector3());
  const scale = TARGET_HEIGHT / Math.max(rawSize.y, 1e-6);

  scene.scale.multiplyScalar(scale);
  scene.updateMatrixWorld(true);

  const scaledBox = new Box3().setFromObject(scene);
  scene.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2;
  scene.position.y -= scaledBox.min.y;
  scene.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2;
  scene.updateMatrixWorld(true);

  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  return { scene, box, size, center, height: size.y };
}

/**
 * Remap PBR texture colour spaces, raise anisotropy to the renderer maximum,
 * and opt every mesh into both shadow passes. Base colour and emissive stay in
 * sRGB; normal / roughness / metalness / AO data maps stay linear. Authored
 * normalScale, roughness, metalness and emissive values are left untouched.
 */
function applyMaterialPolicy(root, gl, uniforms) {
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const srgbMaps = ["map", "emissiveMap"];
  const linearMaps = [
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "alphaMap",
    "bumpMap",
    "displacementMap",
    "lightMap",
    "specularMap",
  ];
  const seen = new Set();

  const configure = (texture, colorSpace) => {
    if (!texture || !texture.isTexture || seen.has(texture)) return;
    seen.add(texture);
    texture.colorSpace = colorSpace;
    texture.anisotropy = maxAnisotropy;
    texture.needsUpdate = true;
  };

  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    // One skinned/baked mesh: culling it by its deformed bounds only creates
    // edge pops while the character turns.
    node.frustumCulled = false;

    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      if (!material) continue;
      srgbMaps.forEach((key) => configure(material[key], SRGBColorSpace));
      linearMaps.forEach((key) => configure(material[key], LinearSRGBColorSpace));

      // The authored golem has no armature, so the flex is a vertex-space
      // bulge around the chest/shoulder band and the point is a weighted
      // shoulder rotation. Both leave the authored transforms and topology
      // untouched, while the soft joint mask keeps the deltoid attached.
      if (uniforms && material.isMeshStandardMaterial) {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uFlex = uniforms.flex;
          shader.uniforms.uTime = uniforms.time;
          shader.uniforms.uArmL = uniforms.armL;
          shader.uniforms.uArmR = uniforms.armR;
          shader.uniforms.uSwingL = uniforms.swingL;
          shader.uniforms.uSwingR = uniforms.swingR;
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              `#include <common>
              uniform float uFlex;
              uniform float uTime;
              uniform float uArmL;
              uniform float uArmR;
              uniform float uSwingL;
              uniform float uSwingR;

              // Raise the arm in the frontal plane, then swing it forward so
              // the hand points at the CTA without leaving the narrow card.
              vec3 ironlogArm(vec3 p, float raiseAngle, float swingAngle, float side) {
                vec3 pivot = vec3(side * 0.235, 0.19, 0.0);
                vec3 d = p - pivot;
                float a = side * raiseAngle;
                float ca = cos(a);
                float sa = sin(a);
                vec3 r = vec3(d.x * ca - d.y * sa, d.x * sa + d.y * ca, d.z);
                float b = -side * swingAngle;
                float cb = cos(b);
                float sb = sin(b);
                r = vec3(r.x * cb + r.z * sb, r.y, -r.x * sb + r.z * cb);
                return r + pivot;
              }`,
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
              float flexChest = smoothstep(-0.06, 0.10, position.y) * (1.0 - smoothstep(0.30, 0.50, position.y));
              float flexCore = 1.0 - smoothstep(-0.16, 0.02, position.y);
              float flexBulge = uFlex * (0.11 * flexChest + 0.025 * flexCore);
              transformed.x *= 1.0 + flexBulge;
              transformed.z *= 1.0 + flexBulge * 0.7;
              transformed.y += uFlex * 0.012 * flexChest;
              transformed.x += sin(uTime * 46.0 + position.y * 24.0) * 0.0018 * uFlex * flexChest;

              float armSide = sign(transformed.x);
              float armRaise = armSide > 0.0 ? uArmR : uArmL;
              float armSwing = armSide > 0.0 ? uSwingR : uSwingL;
              float armLateral = smoothstep(0.19, 0.28, abs(transformed.x));
              float armVertical = smoothstep(-0.27, -0.20, transformed.y) * (1.0 - smoothstep(0.20, 0.29, transformed.y));
              float armJoint = smoothstep(0.03, 0.15, length(vec2(abs(transformed.x) - 0.24, transformed.y - 0.19)));
              float armWeight = armLateral * armVertical * armJoint * smoothstep(0.0, 0.10, armRaise);
              transformed = mix(transformed, ironlogArm(transformed, armRaise, armSwing, armSide), armWeight);`,
            );
        };
        material.customProgramCacheKey = () => "ironlog-golem-flex-v2";
      }

      material.needsUpdate = true;
    }
  });
}

/**
 * Studio environment with a guaranteed offline fallback: the vendored city HDR
 * is PMREM-generated, and if it cannot be fetched the neutral RoomEnvironment
 * is baked instead so metallic/roughness response never goes dark or flat.
 */
function StudioEnvironment({ intensity = 0.95 }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    let target = null;
    let cancelled = false;

    const apply = (renderTarget) => {
      if (cancelled) {
        renderTarget.dispose();
        return;
      }
      target = renderTarget;
      scene.environment = renderTarget.texture;
      scene.environmentIntensity = intensity;
    };

    const fallback = () => {
      if (cancelled) return;
      try {
        const room = new RoomEnvironment();
        apply(pmrem.fromScene(room, 0.04));
        room.dispose();
      } catch (error) {
        console.warn("[IronLog] Procedural studio environment failed.", error);
      }
    };

    const loader = new HDRLoader();
    loader.load(
      HDR_URL,
      (hdr) => {
        if (cancelled) {
          hdr.dispose();
          return;
        }
        try {
          apply(pmrem.fromEquirectangular(hdr));
        } catch (error) {
          console.warn("[IronLog] HDR environment could not be baked.", error);
          fallback();
        }
        hdr.dispose();
      },
      undefined,
      fallback,
    );

    return () => {
      cancelled = true;
      if (scene.environment === target?.texture) scene.environment = null;
      if (target) target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);

  return null;
}

/**
 * Cameras the box from its true extents (height plus the widest silhouette
 * across the allowed orbit), so the character fills the card at every aspect
 * ratio without clipping. Near/far follow the bounding sphere.
 */
function CameraFit({ box, controlsRef }) {
  const camera = useThree((state) => state.camera);
  const { width, height } = useThree((state) => state.size);

  useEffect(() => {
    if (!box || width < 2 || height < 2) return;

    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const radius = box.getBoundingSphere(new Sphere()).radius;
    const aspect = width / height;
    const vFov = MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    // Widest horizontal silhouette over the orbit range.
    const apparentWidth =
      size.x * Math.cos(MAX_AZIMUTH) + size.z * Math.sin(MAX_AZIMUTH);

    const distance =
      Math.max(
        size.y / 2 / Math.tan(vFov / 2),
        apparentWidth / 2 / Math.tan(hFov / 2),
      ) * CAMERA_MARGIN;

    camera.position.set(center.x, center.y, center.z + distance);
    // R3F can commit the size before it has refreshed the projection matrix;
    // pin the aspect explicitly or the first fit bakes a square frustum.
    camera.aspect = aspect;
    camera.near = Math.max(0.01, distance - radius * 2.5);
    camera.far = distance + radius * 3 + 1;
    camera.updateProjectionMatrix();
    camera.lookAt(center);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
  }, [box, camera, controlsRef, width, height]);

  return null;
}

/** Hero renderer can be discarded explicitly if the stage is ever unmounted. */
function RendererDisposer() {
  const gl = useThree((state) => state.gl);

  useEffect(
    () => () => {
      gl.dispose();
      gl.forceContextLoss?.();
    },
    [gl],
  );

  return null;
}

function Golem({ onReady, finePointer }) {
  const gltf = useGltf(MODEL_URL);
  const gl = useThree((state) => state.gl);
  const [hovering, setHovering] = useState(false);
  const controlsRef = useRef(null);
  const flexUniform = useMemo(() => ({ value: 0 }), []);
  const timeUniform = useMemo(() => ({ value: 0 }), []);
  const armLUniform = useMemo(() => ({ value: 0 }), []);
  const armRUniform = useMemo(() => ({ value: 0 }), []);
  const swingLUniform = useMemo(() => ({ value: 0 }), []);
  const swingRUniform = useMemo(() => ({ value: 0 }), []);

  const prepared = useMemo(() => prepareGolem(gltf), [gltf]);

  useEffect(() => {
    if (!prepared) return;
    applyMaterialPolicy(prepared.scene, gl, {
      flex: flexUniform,
      time: timeUniform,
      armL: armLUniform,
      armR: armRUniform,
      swingL: swingLUniform,
      swingR: swingRUniform,
    });
  }, [
    prepared,
    gl,
    flexUniform,
    timeUniform,
    armLUniform,
    armRUniform,
    swingLUniform,
    swingRUniform,
  ]);

  // Clip support for rigged exports; the authored golem is a static mesh, so
  // this stays empty and the procedural layer below drives the motion.
  const clips = useMemo(() => {
    if (!gltf?.animations.length) return { idle: null, hover: null };
    const match = (pattern) => gltf.animations.find((clip) => pattern.test(clip.name));
    return {
      idle: match(/idle|breath|loop|rest/i) || gltf.animations[0],
      hover: match(/hover|wave|hello|flex|greet|excite/i) || null,
    };
  }, [gltf]);

  const mixer = useMemo(
    () => (gltf?.animations.length ? new AnimationMixer(gltf.scene) : null),
    [gltf],
  );

  const clipActions = useMemo(() => {
    if (!mixer) return { idle: null, hover: null };
    return {
      idle: clips.idle ? mixer.clipAction(clips.idle) : null,
      hover: clips.hover ? mixer.clipAction(clips.hover) : null,
    };
  }, [mixer, clips]);

  const activeClip = useRef(null);

  useEffect(() => {
    if (!mixer) return;
    const next = hovering && clipActions.hover ? clipActions.hover : clipActions.idle;
    if (!next || activeClip.current === next) return;

    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    if (activeClip.current) {
      activeClip.current.crossFadeTo(next.play(), 0.3, false);
    } else {
      next.play();
    }
    activeClip.current = next;
  }, [hovering, mixer, clipActions]);

  useEffect(() => {
    if (!gltf) return;
    return () => {
      mixer?.stopAllAction();
      mixer?.uncacheRoot(gltf.scene);
      disposeObject(gltf.scene);
    };
  }, [gltf, mixer]);

  // --- Reactive rig: wrappers keep the authored transforms intact. ---
  const rootRef = useRef(null);
  const turnRef = useRef(null);
  const tiltRef = useRef(null);
  const cursor = useRef({ x: 0, y: 0 });
  const aim = useRef({ x: 0, y: 0 });
  const hoveringRef = useRef(false);
  const squash = useRef(0);
  const hop = useRef(0);
  const reduced = useRef(false);
  const timer = useMemo(() => new Timer(), []);

  // CTA guide: the character turns toward whichever button is being
  // presented and raises the arm on that side to point at it.
  const guide = useRef({
    nx: -0.6,
    ny: 0,
    hovered: null,
    activeButton: null,
    cycleButton: null,
    start: 0,
    until: 0,
    next: 4,
    index: 0,
    buttons: [],
    pointAt: null,
  });
  const flexValue = useRef(0);
  const flexImpulse = useRef(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduced.current = media.matches;
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const track = (event) => {
      cursor.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      cursor.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const reset = () => {
      cursor.current.x = 0;
      cursor.current.y = 0;
    };

    // Capture phase on window: OrbitControls stops propagation on the canvas,
    // so this keeps the character tracking the pointer anywhere on the page.
    window.addEventListener("pointermove", track, { capture: true });
    window.addEventListener("mouseleave", reset);
    return () => {
      window.removeEventListener("pointermove", track, { capture: true });
      window.removeEventListener("mouseleave", reset);
    };
  }, []);

  // Bridge the DOM CTAs to the character: hovering or focusing either button
  // turns the golem toward it, lights the button ring and triggers the flex.
  useEffect(() => {
    const stage = document.querySelector("[data-char-stage]");
    const buttons = Array.from(document.querySelectorAll("[data-cta]"));
    if (!stage || buttons.length === 0) return;

    const g = guide.current;
    g.buttons = buttons;

    const pointAt = (button, hold) => {
      const stageBox = stage.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      if (!stageBox.width || !buttonBox.width) return;

      const dx =
        buttonBox.left + buttonBox.width / 2 - (stageBox.left + stageBox.width / 2);
      const dy =
        buttonBox.top + buttonBox.height / 2 - (stageBox.top + stageBox.height / 2);

      g.nx = MathUtils.clamp(dx / (window.innerWidth * 0.42), -1, 1);
      g.ny = MathUtils.clamp(dy / (window.innerHeight * 0.42), -1, 1);
      g.until = hold ? Infinity : performance.now() / 1000 + 2.4;
    };
    g.pointAt = pointAt;

    const enter = (event) => {
      const button = event.currentTarget;
      g.hovered = button;
      g.cycleButton = null;
      pointAt(button, true);
      flexImpulse.current = Math.max(flexImpulse.current, 1);
    };

    const leave = (event) => {
      if (g.hovered === event.currentTarget) g.hovered = null;
      g.cycleButton = null;
      g.until = performance.now() / 1000 + 0.5;
    };

    const press = () => {
      flexImpulse.current = Math.max(flexImpulse.current, 1.3);
      hop.current = Math.max(hop.current, 0.05);
    };

    const bindings = [
      ["pointerenter", enter],
      ["pointerleave", leave],
      ["focus", enter],
      ["blur", leave],
      ["pointerdown", press],
    ];

    for (const [type, handler] of bindings) {
      buttons.forEach((button) => button.addEventListener(type, handler));
    }

    g.next = performance.now() / 1000 + 3.5;

    return () => {
      for (const [type, handler] of bindings) {
        buttons.forEach((button) => button.removeEventListener(type, handler));
      }
      buttons.forEach((button) => button.classList.remove("is-guided"));
      g.buttons = [];
      g.hovered = null;
      g.activeButton = null;
      g.cycleButton = null;
      g.pointAt = null;
    };
  }, []);

  useEffect(() => {
    const element = gl.domElement;
    const enter = () => {
      hoveringRef.current = true;
      setHovering(true);
    };
    const leave = () => {
      hoveringRef.current = false;
      setHovering(false);
    };
    const press = () => {
      if (reduced.current) return;
      squash.current = 1;
      hop.current = 0.12;
      flexImpulse.current = Math.max(flexImpulse.current, 1.15);
    };

    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointerdown", press);
    return () => {
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointerdown", press);
    };
  }, [gl]);

  // Two frames guarantee the WebGL scene has painted before fading out the
  // static "IL" fallback.
  useEffect(() => {
    if (!prepared) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => onReady?.());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [prepared, onReady]);

  useFrame((state, delta) => {
    if (!prepared) return;

    const dt = Math.min(delta, 0.05);
    timer.update();
    const clockDelta = Math.min(timer.getDelta(), 0.05);
    if (mixer) mixer.update(clockDelta);

    const still = reduced.current;
    const hover = hoveringRef.current ? 1 : 0;
    const t = state.clock.elapsedTime;
    const now = performance.now() / 1000;
    const g = guide.current;

    // Idle presentation cycle: every 8–12s the golem turns to one of the two
    // CTAs, flexes and pulses its ring, alternating which button it presents.
    if (!still && !g.hovered && g.buttons.length > 0 && now > g.next) {
      const button = g.buttons[g.index % g.buttons.length];
      g.index = (g.index + 1) % g.buttons.length;
      g.cycleButton = button;
      g.pointAt?.(button, false);
      g.until = now + 2.6;
      g.start = now;
      g.next = now + 8 + Math.random() * 4;
      hop.current = Math.max(hop.current, 0.055);
      flexImpulse.current = Math.max(flexImpulse.current, 0.85);
    }

    // Explicit hover/focus is user intent, so it still guides under reduced
    // motion; only the idle cycle and its looping flourishes are withheld.
    const guiding = Boolean(g.hovered) || (!still && now < g.until);
    const shownButton = g.hovered || (!still && now < g.until ? g.cycleButton : null);
    if (g.activeButton !== shownButton) {
      g.activeButton?.classList.remove("is-guided");
      shownButton?.classList.add("is-guided");
      g.activeButton = shownButton;
    }

    squash.current = MathUtils.damp(squash.current, 0, 7, dt);
    hop.current = MathUtils.damp(hop.current, 0, 5, dt);

    const aimX = guiding ? g.nx : still ? 0 : cursor.current.x;
    const aimY = guiding ? g.ny : still ? 0 : cursor.current.y;
    aim.current.x = MathUtils.damp(aim.current.x, aimX, guiding ? 6 : 4, dt);
    aim.current.y = MathUtils.damp(aim.current.y, aimY, guiding ? 6 : 4, dt);

    const targetFlex = guiding
      ? g.hovered
        ? still
          ? 0.55
          : 1
        : still
          ? 0.32
          : 0.58 + Math.sin((now - g.start) * 9) * 0.14
      : still
        ? 0
        : hover * 0.12;
    flexImpulse.current = MathUtils.damp(flexImpulse.current, 0, 4, dt);
    flexValue.current = MathUtils.damp(
      flexValue.current,
      Math.max(targetFlex, still ? 0 : flexImpulse.current),
      8,
      dt,
    );
    flexUniform.value = flexValue.current;
    timeUniform.value = t;

    const flex = flexValue.current;
    const breath = still ? 0 : Math.sin(t * 1.6) * 0.008 * (1 + hover * 0.5);
    const scaleX =
      (1 - breath * 0.4) *
      (1 + squash.current * 0.045) *
      (1 + hover * 0.015) *
      (1 + flex * 0.012);
    const scaleY =
      (1 + breath) *
      (1 - squash.current * 0.06) *
      (1 + hover * 0.015) *
      (1 - flex * 0.004);

    if (rootRef.current) {
      rootRef.current.scale.set(scaleX, scaleY, scaleX);
      rootRef.current.position.x = still ? 0 : Math.sin(t * 0.5) * 0.014;
      rootRef.current.position.y = hop.current + hover * 0.02;
    }

    if (turnRef.current) {
      const idleSway = still
        ? 0
        : Math.sin(t * 0.6) * 0.04 + Math.sin(t * 0.23) * 0.02;
      turnRef.current.rotation.y = MathUtils.damp(
        turnRef.current.rotation.y,
        aim.current.x * (guiding ? 0.22 : 0.34) + idleSway,
        guiding ? 6 : 4,
        dt,
      );
    }

    if (tiltRef.current) {
      const nod = guiding && !still ? Math.sin((now - g.start) * 8.5) * 0.03 : 0;
      tiltRef.current.rotation.x = MathUtils.damp(
        tiltRef.current.rotation.x,
        aim.current.y * 0.06 -
          flex * 0.055 +
          nod +
          (still ? 0 : Math.cos(t * 0.8) * 0.012),
        4,
        dt,
      );
      tiltRef.current.rotation.z = MathUtils.damp(
        tiltRef.current.rotation.z,
        -aim.current.x * 0.028 +
          (guiding && !still ? Math.sin(now * 18) * 0.012 * flex : 0),
        4,
        dt,
      );
    }

    // Pointing gesture: the arm nearest the presented CTA lifts in the
    // frontal plane and swings toward the button in depth. The forward swing
    // uses the card's depth so the hand reaches the CTA without crossing the
    // narrow card edge. Angles are damped so hover in/out is a real movement.
    const pointUp = MathUtils.clamp(-g.ny, -1, 1);
    const pointAcross = MathUtils.clamp(Math.abs(g.nx), 0, 1);
    const gestureLive = !still && guiding ? Math.sin(now * 3.4) * 1.4 : 0;
    const raiseDegrees = guiding
      ? MathUtils.clamp(62 + pointUp * 34, 50, 100)
      : 0;
    const raiseTarget = raiseDegrees * MathUtils.DEG2RAD;
    const swingTarget = guiding
      ? MathUtils.clamp(
          54 +
            pointAcross * 6 +
            Math.max(0, raiseDegrees - 70) * 0.55 +
            gestureLive,
          45,
          72,
        ) * MathUtils.DEG2RAD
      : 0;
    const leftPoints = g.nx < 0;
    armLUniform.value = MathUtils.damp(
      armLUniform.value,
      guiding && leftPoints ? raiseTarget : 0,
      7,
      dt,
    );
    armRUniform.value = MathUtils.damp(
      armRUniform.value,
      guiding && !leftPoints ? raiseTarget : 0,
      7,
      dt,
    );
    swingLUniform.value = MathUtils.damp(
      swingLUniform.value,
      guiding && leftPoints ? swingTarget : 0,
      7,
      dt,
    );
    swingRUniform.value = MathUtils.damp(
      swingRUniform.value,
      guiding && !leftPoints ? swingTarget : 0,
      7,
      dt,
    );
  });

  if (!prepared) return null;

  const { scene, box, size, center, height } = prepared;

  return (
    <>
      <group ref={rootRef}>
        <group ref={turnRef}>
          <group ref={tiltRef} position={[0, height / 2, 0]}>
            <group position={[0, -height / 2, 0]}>
              <primitive object={scene} />
            </group>
          </group>
        </group>
      </group>

      <CameraFit box={box} controlsRef={controlsRef} />

      {finePointer ? (
        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[center.x, center.y, center.z]}
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={Math.PI / 2 - 0.3}
          maxPolarAngle={Math.PI / 2 + 0.08}
          minAzimuthAngle={-MAX_AZIMUTH}
          maxAzimuthAngle={MAX_AZIMUTH}
        />
      ) : null}

      <ContactShadows
        position={[0, 0.002, 0]}
        opacity={0.48}
        scale={Math.max(2.4, size.x * 1.9)}
        blur={2.4}
        far={3.2}
        resolution={512}
        color="#07140e"
        frames={1}
      />
    </>
  );
}

function Scene({ onReady }) {
  const [finePointer, setFinePointer] = useState(() =>
    window.matchMedia("(pointer: fine)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(pointer: fine)");
    const sync = () => setFinePointer(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <>
      <ambientLight intensity={0.18} />
      <hemisphereLight args={["#dfe9ff", "#2b2a24", 0.32]} />

      {/* Key, fill and rim: the studio HDR does the PBR lift, these shape it. */}
      <directionalLight
        position={[3.2, 5, 4.2]}
        intensity={2.6}
        color="#fff1d6"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-2.8}
        shadow-camera-right={2.8}
        shadow-camera-top={3.2}
        shadow-camera-bottom={-1.4}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight
        position={[-3.6, 2.6, 2.4]}
        intensity={0.95}
        color="#bdd6ff"
      />
      <directionalLight
        position={[-0.6, 3.4, -4.4]}
        intensity={2}
        color="#ffe0b0"
      />

      <StudioEnvironment intensity={0.95} />

      <SilentBoundary>
        <Golem onReady={onReady} finePointer={finePointer} />
      </SilentBoundary>

      <RendererDisposer />
    </>
  );
}

export default function Scene3D({ onReady }) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 1, 6], fov: 24, near: 0.1, far: 40 }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      onCreated={({ gl }) => {
        gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        gl.outputColorSpace = SRGBColorSpace;
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = PCFShadowMap;
        gl.setClearColor(0x000000, 0);
      }}
    >
      <Scene onReady={onReady} />
    </Canvas>
  );
}

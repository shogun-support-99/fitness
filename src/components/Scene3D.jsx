import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  OrbitControls,
} from "@react-three/drei";
import { MathUtils } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * The mascot and the studio HDR are resolved from the built bundle's URL so
 * the same file works at `/` locally and `/fitness/` on GitHub Pages.
 */
const MODEL_URL = new URL("../models/spotter.glb", import.meta.url).href;
const CITY_HDR_URL = new URL(
  "../models/potsdamer_platz_1k.hdr",
  import.meta.url,
).href;

useLoader.preload(GLTFLoader, MODEL_URL);

/** Keep a failed HDR from taking the whole hero down with it. */
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

function Kettle({ onReady }) {
  const { scene } = useLoader(GLTFLoader, MODEL_URL);
  const { gl } = useThree();
  const rig = useMemo(() => {
    const body = scene.getObjectByName("Body");
    const head = scene.getObjectByName("Head");
    const arm = scene.getObjectByName("ArmWave");
    const eyeL = scene.getObjectByName("EyeL");
    const eyeR = scene.getObjectByName("EyeR");

    if (head) head.rotation.order = "YXZ";

    scene.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    });

    return { body, head, arm, eyeL, eyeR };
  }, [scene]);

  // True global cursor tracking: the character reacts no matter where the
  // pointer sits on the page. Normalised to -1..1 over the whole window.
  const cursor = useRef({ x: 0, y: 0 });
  const hover = useRef(false);
  const smooth = useRef({ x: 0, y: 0, z: 0 });
  const eyeAim = useRef({ x: 0, y: 0 });
  const waveAt = useRef(0.7);
  const time = useRef(0);
  const reduced = useRef(false);
  // Blink state: { active, t, next } — next blink scheduled 3–7s out.
  const blink = useRef({ active: false, t: 0, next: 3 + Math.random() * 4 });
  // Idle glance: character looks around on its own between cursor reactions.
  const glance = useRef({ active: false, t: 0, next: 2 + Math.random() * 3, targetX: 0, targetY: 0 });
  // Interaction: squash/stretch + enthusiastic wave on click, puff on hover.
  const squash = useRef(1);
  const puff = useRef(1);

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

    // Window-level capture listener: OrbitControls calls stopPropagation on
    // the canvas, which would block any bubbling listener. Capture phase on
    // window fires before the target and cannot be stopped by downstream
    // listeners, so the character tracks the cursor everywhere on the page.
    window.addEventListener("pointermove", track, { capture: true });
    window.addEventListener("mouseleave", reset);
    return () => {
      window.removeEventListener("pointermove", track, { capture: true });
      window.removeEventListener("mouseleave", reset);
    };
  }, []);

  useEffect(() => {
    const element = gl.domElement;
    const onDown = () => {
      waveAt.current = time.current;
      squash.current = 0.6;
    };
    const onUp = () => {
      squash.current = 1;
    };
    const onEnter = () => { hover.current = true; };
    const onLeave = () => { hover.current = false; };

    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointerleave", onLeave);
    element.addEventListener("pointerenter", onEnter);
    return () => {
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointerleave", onLeave);
      element.removeEventListener("pointerenter", onEnter);
    };
  }, [gl]);

  const ready = useCallback(() => {
    const frame = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(frame);
  }, [onReady]);

  useEffect(ready, [ready]);

  useFrame((state, delta) => {
    const { body, head, arm, eyeL, eyeR } = rig;
    if (!head || !body) return;

    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    time.current = t;

    const still = reduced.current;

    // --- Squash/stretch from click (decays back to 1) ---
    if (squash.current < 1) {
      squash.current = MathUtils.damp(squash.current, 1, 8, dt);
    }
    const sx = 1 + (1 - squash.current) * 0.25; // wider when squashed
    const sy = squash.current;                    // shorter when squashed
    const sz = 1 + (1 - squash.current) * 0.1;

    // --- Hover puff ---
    if (hover.current) {
      puff.current = MathUtils.damp(puff.current, 1.06, 6, dt);
    } else {
      puff.current = MathUtils.damp(puff.current, 1, 6, dt);
    }

    // --- Cursor aim (global pointer, works everywhere on page) ---
    const aimX = still ? 0 : cursor.current.x;
    const aimY = still ? 0 : cursor.current.y;

    smooth.current.x = MathUtils.damp(smooth.current.x, aimX, 6, dt);
    smooth.current.y = MathUtils.damp(smooth.current.y, aimY, 6, dt);
    smooth.current.z = MathUtils.damp(
      smooth.current.z,
      still ? 0 : Math.sin(t * 0.9) * 0.06,
      4,
      dt,
    );

    // --- Idle glancing: look around on its own every few seconds ---
    if (!glance.current.active && t > glance.current.next) {
      glance.current.active = true;
      glance.current.t = t;
      glance.current.next = t + 2 + Math.random() * 3;
      glance.current.targetX = (Math.random() - 0.5) * 1.4;
      glance.current.targetY = (Math.random() - 0.5) * 0.8;
    }
    let glanceX = 0;
    let glanceY = 0;
    if (glance.current.active) {
      const gt = t - glance.current.t;
      if (gt < 1.2) {
        const ease = 1 - Math.pow(1 - gt / 1.2, 3);
        glanceX = glance.current.targetX * ease;
        glanceY = glance.current.targetY * ease;
      } else if (gt < 2.2) {
        const ease = Math.pow(1 - (gt - 1.2) / 1, 3);
        glanceX = glance.current.targetX * ease;
        glanceY = glance.current.targetY * ease;
      } else {
        glance.current.active = false;
      }
    }

    const lookX = smooth.current.x + glanceX;
    const lookY = smooth.current.y + glanceY;
    const roll = smooth.current.z;

    // --- Head: strong toy-like reactions to cursor + idle glance ---
    head.rotation.y = MathUtils.damp(
      head.rotation.y,
      lookX * 0.6 + (still ? 0 : Math.sin(t * 0.5) * 0.05),
      5,
      dt,
    );
    head.rotation.x = MathUtils.damp(
      head.rotation.x,
      -lookY * 0.45 + (still ? 0 : Math.cos(t * 0.7) * 0.03),
      5,
      dt,
    );
    head.rotation.z = MathUtils.damp(
      head.rotation.z,
      -lookX * 0.25 + roll,
      5,
      dt,
    );

    // --- Body: lean + bouncier bob ---
    body.rotation.z = MathUtils.damp(
      body.rotation.z,
      -lookX * 0.12 + roll * 0.4,
      4,
      dt,
    );
    const bobAmplitude = hover.current ? 0.018 : 0.01;
    body.position.y = still
      ? 0
      : Math.sin(t * 1.8) * bobAmplitude + Math.cos(t * 0.9) * 0.005;

    // --- Apply squash/stretch + puff to whole character ---
    head.scale.set(sx * puff.current, sy * puff.current, sz * puff.current);
    body.scale.set(sx * puff.current, sy * puff.current, sz * puff.current);

    // --- Eyes: track cursor + glance, blink, and squash with click ---
    const eyeTargetX = lookX * 0.5 + glanceX * 0.5;
    const eyeTargetY = lookY * 0.5 + glanceY * 0.5;
    eyeAim.current.x = MathUtils.damp(eyeAim.current.x, eyeTargetX, 8, dt);
    eyeAim.current.y = MathUtils.damp(eyeAim.current.y, eyeTargetY, 8, dt);
    const eyeX = MathUtils.clamp(eyeAim.current.y * 0.25, -0.08, 0.08);
    const eyeY = MathUtils.clamp(-eyeAim.current.x * 0.25, -0.08, 0.08);
    [eyeL, eyeR].forEach((eye) => {
      if (!eye) return;
      eye.rotation.x = MathUtils.damp(eye.rotation.x, eyeX, 10, dt);
      eye.rotation.y = MathUtils.damp(eye.rotation.y, eyeY, 10, dt);
      // Eyes squash vertically when the character is squashed.
      eye.scale.y = 1 * (1 - (1 - squash.current) * 0.5);
    });

    // --- Occasional blink: squash the eyes flat briefly ---
    if (!blink.current.active && t > blink.current.next) {
      blink.current.active = true;
      blink.current.t = t;
      blink.current.next = t + 3 + Math.random() * 4;
    }
    let blinkScale = 1;
    if (blink.current.active) {
      const bt = t - blink.current.t;
      if (bt > 0.04 && bt < 0.12) blinkScale = 0.05;
      else if (bt > 0.2) {
        blink.current.active = false;
        blinkScale = 1;
      }
    }
    [eyeL, eyeR].forEach((eye) => {
      if (!eye) return;
      eye.scale.y *= blinkScale;
    });

    // --- Arm: enthusiastic wave on click, gentle idle sway ---
    if (t - waveAt.current > 7) waveAt.current = t;
    const waveTime = t - waveAt.current;
    const wave =
      still || waveTime >= 1.5
        ? 0
        : Math.sin(waveTime * Math.PI * 4.2) *
            0.3 *
            (1 - waveTime / 1.5);
    if (arm) {
      arm.rotation.z = MathUtils.damp(
        arm.rotation.z,
        wave + (still ? 0 : Math.sin(t * 1.4) * 0.03),
        10,
        dt,
      );
    }
  });

  return <primitive object={scene} />;
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
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[2.6, 4.2, 3.2]}
        intensity={2.1}
        color="#fff4da"
      />
      <directionalLight
        position={[-3.4, 2.2, -2.6]}
        intensity={0.85}
        color="#c8e2ff"
      />
      <directionalLight
        position={[0.4, 2.2, 4.2]}
        intensity={0.5}
        color="#fff7e6"
      />

      <Suspense fallback={null}>
        <Kettle onReady={onReady} />
      </Suspense>

      <SilentBoundary>
        <Suspense fallback={null}>
          <Environment files={CITY_HDR_URL} environmentIntensity={0.9} />
        </Suspense>
      </SilentBoundary>

      <ContactShadows
        position={[0, 0.002, 0.08]}
        opacity={0.42}
        scale={3.4}
        blur={2.4}
        far={2.8}
        resolution={512}
        color="#07140e"
      />

      {finePointer ? (
        <OrbitControls
          makeDefault
          target={[0, 0.98, 0]}
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={Math.PI / 2 - 0.32}
          maxPolarAngle={Math.PI / 2 + 0.08}
          minAzimuthAngle={-0.42}
          maxAzimuthAngle={0.42}
        />
      ) : null}
    </>
  );
}

export default function Scene3D({ onReady }) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 1.12, 5.1], fov: 32, near: 0.1, far: 30 }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Scene onReady={onReady} />
    </Canvas>
  );
}

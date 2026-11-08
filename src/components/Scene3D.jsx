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
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import { MathUtils } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * The mascot and the studio HDR are resolved from the built bundle's URL so
 * the same file works at `/` locally and `/fitness/` on GitHub Pages.
 */
const MODEL_URL = new URL("../models/spotter.glb", import.meta.url).href;
const CITY_HDR_URL = new URL("../models/potsdamer_platz_1k.hdr", import.meta.url).href;

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

    if (head) head.rotation.order = "YXZ";

    scene.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    });

    return { body, head, arm };
  }, [scene]);

  const pointer = useRef({ x: 0, y: 0 });
  const smooth = useRef({ x: 0, y: 0 });
  const waveAt = useRef(0.7);
  const time = useRef(0);
  const reduced = useRef(false);

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
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const reset = () => {
      pointer.current.x = 0;
      pointer.current.y = 0;
    };

    window.addEventListener("pointermove", track, { passive: true });
    document.addEventListener("mouseleave", reset);
    return () => {
      window.removeEventListener("pointermove", track);
      document.removeEventListener("mouseleave", reset);
    };
  }, []);

  useEffect(() => {
    const element = gl.domElement;
    const wave = () => {
      waveAt.current = time.current;
    };
    element.addEventListener("pointerdown", wave);
    return () => element.removeEventListener("pointerdown", wave);
  }, [gl]);

  const ready = useCallback(() => {
    const frame = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(frame);
  }, [onReady]);

  useEffect(ready, [ready]);

  useFrame((state, delta) => {
    const { body, head, arm } = rig;
    if (!head || !body) return;

    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    time.current = t;

    const still = reduced.current;
    const aimX = still ? 0 : pointer.current.x;
    const aimY = still ? 0 : pointer.current.y;

    smooth.current.x = MathUtils.damp(smooth.current.x, aimX, 5.5, dt);
    smooth.current.y = MathUtils.damp(smooth.current.y, aimY, 5.5, dt);

    const lookX = smooth.current.x;
    const lookY = smooth.current.y;

    head.rotation.y = MathUtils.damp(
      head.rotation.y,
      lookX * 0.38 + (still ? 0 : Math.sin(t * 0.55) * 0.018),
      5,
      dt,
    );
    head.rotation.x = MathUtils.damp(
      head.rotation.x,
      -lookY * 0.14 + (still ? 0 : Math.sin(t * 0.8) * 0.01),
      5,
      dt,
    );
    head.rotation.z = MathUtils.damp(head.rotation.z, -lookX * 0.045, 5, dt);

    body.rotation.z = MathUtils.damp(body.rotation.z, -lookX * 0.018, 4, dt);
    body.position.y = still ? 0 : Math.sin(t * 1.45) * 0.008;

    if (t - waveAt.current > 7) waveAt.current = t;
    const waveTime = t - waveAt.current;
    const wave =
      still || waveTime >= 1.5
        ? 0
        : Math.sin(waveTime * Math.PI * 4.2) * 0.19 * (1 - waveTime / 1.5);

    if (arm) {
      arm.rotation.z = MathUtils.damp(
        arm.rotation.z,
        wave + (still ? 0 : Math.sin(t * 1.15) * 0.012),
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
      <directionalLight position={[2.6, 4.2, 3.2]} intensity={2.1} color="#fff4da" />
      <directionalLight position={[-3.4, 2.2, -2.6]} intensity={0.85} color="#c8e2ff" />
      <directionalLight position={[0.4, 2.2, 4.2]} intensity={0.5} color="#fff7e6" />

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

import { Component } from "react";
import { createRoot } from "react-dom/client";

import Scene3D from "../components/Scene3D.jsx";

/**
 * Mount the React Three Fiber hero into the landing stage.
 *
 * The fallback "IL" stays visible until the GLB has rendered; if WebGL is
 * missing or the scene throws, the card simply keeps its static fallback.
 */
class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn("[IronLog] 3D hero unavailable.", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const stage = document.querySelector("[data-char-stage]");
const host = stage?.querySelector("[data-scene3d]");

if (stage && host) {
  const probe = document.createElement("canvas");
  const gl = probe.getContext("webgl2") || probe.getContext("webgl");

  if (gl) {
    createRoot(host).render(
      <SceneBoundary>
        <Scene3D onReady={() => stage.classList.add("is-ready")} />
      </SceneBoundary>,
    );
  } else {
    console.warn("[IronLog] WebGL is unavailable; keeping the static hero fallback.");
  }
}

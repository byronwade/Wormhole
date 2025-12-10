"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";

// Raymarched wormhole tunnel - flying through a 3D tunnel
const wormholeVertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

const wormholeFragmentShader = `
  uniform vec2 u_resolution;
  uniform float u_time;

  #define PI 3.14159265359
  #define TAU 6.28318530718

  const int maxIterations = 64;
  const float stepScale = 0.9;
  const float stopThreshold = 0.005;
  const float clipNear = 0.0;
  const float clipFar = 32.0;
  const float eps = 0.005;
  const float speed = 1.8;

  // Tunnel path - dramatic curves you can feel
  vec3 tunnelPath(float z) {
    return vec3(
      sin(z * 0.4) * 1.8 + sin(z * 0.15) * 1.0,
      cos(z * 0.35) * 1.8 + cos(z * 0.2) * 1.0,
      z
    );
  }

  // The tunnel world - camera always at center
  float world_sdf(vec3 p) {
    vec3 pathPos = tunnelPath(p.z);
    p.xy -= pathPos.xy;

    // Main tunnel - inverted cylinder, camera at center
    float tunnelRadius = 0.5;
    float tunnel = tunnelRadius - length(p.xy);

    return tunnel;
  }

  // Calculate surface normal - optimized for cylinder tunnel
  vec3 calcNormal(vec3 p) {
    vec3 pathPos = tunnelPath(p.z);
    vec2 localXY = p.xy - pathPos.xy;
    return normalize(vec3(-localXY, 0.0));
  }

  // Raymarching
  float rayMarch(vec3 ro, vec3 rd) {
    float depth = clipNear;

    for (int i = 0; i < maxIterations; i++) {
      float sceneDist = world_sdf(ro + rd * depth);
      if (sceneDist < stopThreshold || depth >= clipFar) break;
      depth += sceneDist * stepScale;
    }

    return depth;
  }

  void main() {
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv = (2.0 * gl_FragCoord.xy / u_resolution.xy - 1.0) * aspect;

    // Current Z position in tunnel
    float currentZ = u_time * speed;

    // Camera position - exactly on the tunnel path
    vec3 camPos = tunnelPath(currentZ);

    // Calculate forward direction using derivative of path (tangent)
    // This ensures we always look exactly along the tunnel center
    float delta = 0.01;
    vec3 pathAhead = tunnelPath(currentZ + delta);
    vec3 forward = normalize(pathAhead - camPos);

    // Stable up vector - prevent roll
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = cross(forward, right);

    // Ray direction - tighter FOV to feel the movement more
    float fov = 1.2;
    vec3 rd = normalize(forward + fov * uv.x * right + fov * uv.y * up);

    // Raymarch
    float dist = rayMarch(camPos, rd);

    // Background - pure black
    if (dist >= clipFar) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    // Surface position
    vec3 p = camPos + rd * dist;
    vec3 n = calcNormal(p);

    // Get local position in tunnel for texturing
    vec3 pathPos = tunnelPath(p.z);
    vec3 localP = p;
    localP.xy -= pathPos.xy;
    float ang = atan(localP.y, localP.x);

    // === Warp Drive Tunnel - Dark and Subtle ===

    // Smooth gradient based on depth - darker overall
    float depthGlow = smoothstep(clipFar, 0.0, dist) * 0.4 + 0.05;

    // Streaking lines effect - dimmed for subtlety
    float streaks = sin(ang * 30.0 + p.z * 8.0) * 0.5 + 0.5;
    streaks = pow(streaks, 5.0) * 0.3; // Higher power = sharper, lower multiplier = dimmer

    // Very subtle rings flying past
    float ringPhase = fract(p.z * 1.2);
    float ringPattern = smoothstep(0.08, 0.0, abs(ringPhase - 0.5) - 0.42) * 0.12;

    // Base: dim streaks on near-black
    vec3 baseColor = vec3(streaks + ringPattern);

    // Darker space colors
    vec3 spaceBlue = vec3(0.04, 0.04, 0.08);    // Very deep space blue
    vec3 spacePurple = vec3(0.03, 0.03, 0.06);  // Very deep space purple
    vec3 hunterGreen = vec3(0.12, 0.22, 0.14);  // Dimmed hunter green accent

    // Mix in space colors based on angle and depth
    float colorMix = sin(ang * 2.0 + p.z * 0.3) * 0.5 + 0.5;
    vec3 spaceColor = mix(spaceBlue, spacePurple, colorMix);

    // Add subtle hunter green accent to bright areas
    vec3 accentColor = hunterGreen * ringPattern * 1.2;

    // Combine: dim streaks with space color tint and subtle green accents
    vec3 tunnelColor = baseColor + spaceColor * 0.2 + accentColor;

    // Intensity based on depth
    float intensity = depthGlow;

    // Final tunnel color with intensity
    vec3 col = tunnelColor * intensity;

    // Lighting - very subtle
    vec3 lightPos = camPos + forward * 2.0;
    vec3 lightDir = normalize(lightPos - p);
    vec3 lightCol = vec3(1.0, 1.0, 1.0) * 0.4; // Dimmer light

    float len = length(lightPos - p);
    float atten = min(1.0 / (0.3 * len * len), 1.0); // Faster falloff

    float diff = max(dot(n, lightDir), 0.0);
    float ambient = 0.6; // Lower ambient

    col = col * (diff * 0.3 + ambient) * lightCol * atten;

    // Fresnel edge glow - subtle with hint of hunter green
    float fresnel = pow(1.0 - abs(dot(n, -rd)), 3.5);
    col += (vec3(0.5) + hunterGreen * 0.2) * fresnel * 0.2;

    // Distance fog - stronger fade to black
    float fog = 1.0 - exp(-dist * 0.15);
    col = mix(col, vec3(0.0), fog);


    // Entry fade-in animation (2 seconds)
    float fadeIn = smoothstep(0.0, 2.0, u_time);
    col *= fadeIn;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

function WormholeShader() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size } = useThree();

  const uniforms = useMemo(
    () => ({
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    [size.width, size.height]
  );

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.u_time.value = state.clock.elapsedTime;
      material.uniforms.u_resolution.value.set(
        state.gl.domElement.width,
        state.gl.domElement.height
      );
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={wormholeVertexShader}
        fragmentShader={wormholeFragmentShader}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

export default function WormholeScene() {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 1] }}
        dpr={1}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
        }}
        style={{ background: "var(--wormhole-off-black)" }}
      >
        <WormholeShader />
      </Canvas>
      {/* Subtle blur for softer feel */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backdropFilter: "blur(1.5px)",
          WebkitBackdropFilter: "blur(1.5px)",
        }}
      />
      {/* Gradient overlays for text readability - darker */}
      <div className="absolute inset-0 bg-gradient-to-b from-wormhole-off-black/80 via-wormhole-off-black/30 to-wormhole-off-black/90 pointer-events-none" />
      {/* Radial gradient for stronger vignette effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, transparent 30%, rgba(13,13,13,0.7) 100%)",
        }}
      />
    </div>
  );
}

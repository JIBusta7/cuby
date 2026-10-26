/**
 * Material de una cara: dibuja la matriz de 7×7 LEDs a partir de una textura
 * de 7×7 píxeles (uno por LED). Cada LED es un cuadrado redondeado con un
 * halo, sobre el cuerpo oscuro del cubo. Los colores salen tal cual (sin
 * gestión de color ni tone mapping) para coincidir con los paneles 2D.
 * Donde el alfa es 0 no hay LED: se dibuja el agujero del cable.
 */
import * as THREE from 'three';

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  void main() {
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uBody;
  varying vec2 vUv;
  varying vec3 vN;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 g = vUv * 7.0;
    float cx = clamp(floor(g.x), 0.0, 6.0);
    float rowTop = 6.0 - clamp(floor(g.y), 0.0, 6.0);
    vec4 led = texture2D(uMap, vec2((cx + 0.5) / 7.0, (rowTop + 0.5) / 7.0));
    vec2 p = fract(g) - 0.5;

    float light = 0.78 + 0.22 * max(dot(vN, normalize(vec3(0.35, 0.85, 0.55))), 0.0);
    vec3 body = uBody * light;

    vec3 c;
    if (led.a < 0.5) {
      // Sin LED: agujero del cable.
      float hole = 1.0 - smoothstep(0.2, 0.24, length(p));
      c = mix(body, vec3(0.01), hole);
    } else {
      float d = sdRoundBox(p, vec2(0.41), 0.15);
      float mask = 1.0 - smoothstep(-0.015, 0.015, d);
      float glow = exp(-max(d, 0.0) * 16.0) * 0.5;
      c = mix(body, led.rgb, mask) + led.rgb * glow * (1.0 - mask);
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function createLedMaterial(map: THREE.DataTexture, body = new THREE.Color(0.075, 0.07, 0.13)): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uBody: { value: body } },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}

export function createFaceTexture(): { data: Uint8Array; texture: THREE.DataTexture } {
  const data = new Uint8Array(7 * 7 * 4);
  const texture = new THREE.DataTexture(data, 7, 7, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { data, texture };
}

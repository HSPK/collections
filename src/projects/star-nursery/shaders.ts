export const particleVertex = /* glsl */ `
  uniform float uTime;
  uniform float uFormation;
  uniform float uWind;
  uniform float uInfluence;
  uniform float uDpr;
  uniform float uHeight;
  uniform float uFocal;
  attribute vec3 aAnchor;
  attribute vec3 aTint;
  attribute float aSize;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vPhase;
  varying float vLight;

  void main() {
    float scale = (1.0 - uFormation * 0.62) * (1.0 + uWind * 0.65)
      * (1.0 + uWind * 0.065 * sin(uTime + aPhase));
    float center = 1.0 - uFormation * 0.1 + uWind * 0.08;
    float amplitude = (0.035 + uWind * 0.11) * (1.0 - uFormation * 0.45);
    vec3 p = aAnchor * center + (position - aAnchor) * scale;
    vec3 drift = vec3(
      sin(uTime + aPhase + p.z * 0.6),
      cos(uTime * 2.0 + aPhase * 0.8 + p.x * 0.5),
      sin(uTime + aPhase * 0.7 + p.y * 0.6)
    ) * amplitude;
    p = mix(position, p + drift, uInfluence);
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * uDpr * (uHeight / 640.0)
      * 4.0 * uFocal / max(2.0, -viewPosition.z), 0.9 * uDpr, 128.0 * uDpr);
    vColor = aTint;
    vPhase = aPhase;
    vLight = 0.86 + 0.14 * sin(uTime * 2.0 + aPhase);
  }
`;

export const dustFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vLight;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float radius = dot(p, p);
    if (radius > 1.0) discard;
    float edge = 1.0 - radius;
    gl_FragColor = vec4(vColor * vLight, edge * edge * uOpacity);
    #include <colorspace_fragment>
  }
`;

export const volumeFragment = /* glsl */ `
  uniform float uOpacity;
  uniform float uShade;
  uniform float uFormation;
  varying vec3 vColor;
  varying float vPhase;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p += 0.075 * vec2(sin(p.y * 7.0 + vPhase), cos(p.x * 6.0 - vPhase));
    float radius = dot(p, p);
    if (radius > 1.0) discard;
    float edge = 1.0 - radius;
    float grain = 0.76 + 0.16 * sin(p.x * 13.0 + vPhase) * sin(p.y * 11.0 - vPhase)
      + 0.08 * sin((p.x + p.y) * 23.0 + vPhase);
    float alpha = edge * edge * edge * grain * uOpacity;
    vec3 tint = mix(vColor * (0.86 + uFormation * 0.4), vec3(0.001, 0.002, 0.004), uShade);
    gl_FragColor = vec4(tint, alpha);
    #include <colorspace_fragment>
  }
`;

export const seedFragment = /* glsl */ `
  uniform float uFormation;
  varying vec3 vColor;
  varying float vLight;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float radius = dot(p, p);
    if (radius > 1.0) discard;
    float edge = 1.0 - radius;
    float halo = edge * edge * edge * edge * 0.035;
    float core = exp(-radius * 720.0);
    float vertical = exp(-abs(p.x) * 145.0) * pow(max(0.0, 1.0 - abs(p.y)), 7.0);
    float horizontal = exp(-abs(p.y) * 145.0) * pow(max(0.0, 1.0 - abs(p.x)), 7.0);
    float light = halo + core + (vertical + horizontal) * 0.26;
    gl_FragColor = vec4(vColor * (1.0 + uFormation * 0.5), light * vLight);
    #include <colorspace_fragment>
  }
`;

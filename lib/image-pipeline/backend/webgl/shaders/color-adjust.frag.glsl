#version 100
precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform vec3 uColorShift;

void main() {
  vec4 color = texture2D(uSource, vUv);
  color.rgb = clamp(color.rgb + uColorShift, 0.0, 1.0);
  gl_FragColor = color;
}

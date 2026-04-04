precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform float uGamma;

void main() {
  vec4 color = texture2D(uSource, vUv);
  color.rgb = pow(max(color.rgb, vec3(0.0)), vec3(max(uGamma, 0.001)));
  gl_FragColor = color;
}

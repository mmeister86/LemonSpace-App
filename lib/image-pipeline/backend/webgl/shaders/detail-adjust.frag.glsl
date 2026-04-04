precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform float uSharpenBoost;
uniform float uClarityBoost;
uniform float uDenoiseLuma;
uniform float uDenoiseColor;
uniform float uGrainAmount;
uniform float uGrainScale;

float pseudoNoise(float seed) {
  float x = sin(seed * 12.9898) * 43758.5453;
  return fract(x);
}

void main() {
  vec4 color = texture2D(uSource, vUv);
  vec3 rgb = color.rgb * 255.0;

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));

  rgb.r = rgb.r + (rgb.r - luma) * uSharpenBoost * 0.6;
  rgb.g = rgb.g + (rgb.g - luma) * uSharpenBoost * 0.6;
  rgb.b = rgb.b + (rgb.b - luma) * uSharpenBoost * 0.6;

  float midtoneFactor = 1.0 - abs(luma / 255.0 - 0.5) * 2.0;
  float clarityScale = 1.0 + uClarityBoost * midtoneFactor * 0.7;
  rgb = (rgb - 128.0) * clarityScale + 128.0;

  if (uDenoiseLuma > 0.0 || uDenoiseColor > 0.0) {
    rgb = rgb * (1.0 - uDenoiseLuma * 0.2) + vec3(luma) * uDenoiseLuma * 0.2;

    float average = (rgb.r + rgb.g + rgb.b) / 3.0;
    rgb = rgb * (1.0 - uDenoiseColor * 0.2) + vec3(average) * uDenoiseColor * 0.2;
  }

  if (uGrainAmount > 0.0) {
    float grainSeed = (gl_FragCoord.y * 4096.0 + gl_FragCoord.x) / max(0.5, uGrainScale);
    float grain = (pseudoNoise(grainSeed) - 0.5) * uGrainAmount * 40.0;
    rgb += vec3(grain);
  }

  gl_FragColor = vec4(clamp(rgb / 255.0, 0.0, 1.0), color.a);
}

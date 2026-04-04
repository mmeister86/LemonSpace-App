precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform float uExposureFactor;
uniform float uContrastFactor;
uniform float uBrightnessShift;
uniform float uHighlights;
uniform float uShadows;
uniform float uWhites;
uniform float uBlacks;
uniform float uVignetteAmount;
uniform float uVignetteSize;
uniform float uVignetteRoundness;

float toByte(float value) {
  return clamp(floor(value + 0.5), 0.0, 255.0);
}

void main() {
  vec4 color = texture2D(uSource, vUv);
  vec3 rgb = color.rgb * 255.0;

  rgb *= uExposureFactor;
  rgb = (rgb - 128.0) * uContrastFactor + 128.0 + uBrightnessShift;

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float highlightsBoost = (luma / 255.0) * uHighlights * 40.0;
  float shadowsBoost = ((255.0 - luma) / 255.0) * uShadows * 40.0;
  float whitesBoost = (luma / 255.0) * uWhites * 35.0;
  float blacksBoost = ((255.0 - luma) / 255.0) * uBlacks * 35.0;
  float totalBoost = highlightsBoost + shadowsBoost + whitesBoost + blacksBoost;
  rgb = vec3(
    toByte(rgb.r + totalBoost),
    toByte(rgb.g + totalBoost),
    toByte(rgb.b + totalBoost)
  );

  if (uVignetteAmount > 0.0) {
    vec2 centeredUv = (vUv - vec2(0.5)) / vec2(0.5);
    float radialDistance = length(centeredUv);
    float softEdge = pow(1.0 - clamp(radialDistance, 0.0, 1.0), 1.0 + uVignetteRoundness);
    float strength = 1.0 - uVignetteAmount * (1.0 - softEdge) * (1.5 - uVignetteSize);
    rgb = vec3(
      toByte(rgb.r * strength),
      toByte(rgb.g * strength),
      toByte(rgb.b * strength)
    );
  }

  gl_FragColor = vec4(clamp(rgb / 255.0, 0.0, 1.0), color.a);
}

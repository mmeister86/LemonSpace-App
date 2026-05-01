/**
 * Onboarding note:
 * Image pipeline utility for raw shader modules.d. Keep CPU/WebGL/worker behavior deterministic so preview and render tests can assert parity.
 */

declare module "*.glsl?raw" {
  const source: string;
  export default source;
}

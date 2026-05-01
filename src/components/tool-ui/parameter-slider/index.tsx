/**
 * Onboarding note:
 * Source module for index. Keep it isolated from UI concerns unless explicitly used as a client entry point.
 */

export { ParameterSlider } from "./parameter-slider";
export type {
  ParameterSliderProps,
  SliderConfig,
  SliderValue,
  SerializableParameterSlider,
} from "./schema";

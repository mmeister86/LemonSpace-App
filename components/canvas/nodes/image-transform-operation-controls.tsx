/**
 * Onboarding note:
 * Renders and manages the Canvas image transform operation controls node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { RefObject } from "react";

import type {
  ChangeCameraOutputFormat,
  ImageTransformOperation,
  StyleTransferEngine,
  StyleTransferFlavor,
  StyleTransferPortraitBeautifier,
  StyleTransferPortraitStyle,
  UpscaleOutputFormat,
  UpscaleScale,
} from "@/lib/image-transform-models";

import {
  STYLE_TRANSFER_ENGINES,
  STYLE_TRANSFER_FLAVORS,
  STYLE_TRANSFER_PORTRAIT_BEAUTIFIERS,
  STYLE_TRANSFER_PORTRAIT_STYLES,
} from "./image-transform-operation-config";

type Translate = (key: string) => string;

export function ImageTransformOperationControls({
  operation,
  operationRef,
  saveOperation,
  t,
}: {
  operation: ImageTransformOperation;
  operationRef: RefObject<ImageTransformOperation>;
  saveOperation: (operation: ImageTransformOperation) => void;
  t: Translate;
}) {
  if (operation.type === "upscale") {
    return (
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">
          {t("controls.scale")}
          <select
            className="nodrag nowheel h-8 rounded-md border bg-background px-2"
            value={operation.scale}
            onChange={(event) =>
              saveOperation({
                ...operation,
                scale: Number(event.target.value) as UpscaleScale,
              })
            }
          >
            {[2, 4, 8, 16].map((scale) => (
              <option key={scale} value={scale}>
                {scale}x
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("controls.format")}
          <select
            className="nodrag nowheel h-8 rounded-md border bg-background px-2"
            value={operation.outputFormat}
            onChange={(event) =>
              saveOperation({
                ...operation,
                outputFormat: event.target.value as UpscaleOutputFormat,
              })
            }
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </label>
      </div>
    );
  }

  if (operation.type === "style-transfer") {
    return (
      <div className="flex flex-col gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between">
            <span>{t("controls.styleStrength")}</span>
            <span className="text-[10px] text-muted-foreground">
              {operation.styleStrength}
            </span>
          </span>
          <input
            className="nodrag nowheel"
            type="range"
            min={0}
            max={100}
            value={operation.styleStrength}
            onChange={(event) =>
              saveOperation({
                ...operation,
                styleStrength: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between">
            <span>{t("controls.structureStrength")}</span>
            <span className="text-[10px] text-muted-foreground">
              {operation.structureStrength}
            </span>
          </span>
          <input
            className="nodrag nowheel"
            type="range"
            min={0}
            max={100}
            value={operation.structureStrength}
            onChange={(event) =>
              saveOperation({
                ...operation,
                structureStrength: Number(event.target.value),
              })
            }
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            {t("controls.flavor")}
            <select
              className="nodrag nowheel h-8 rounded-md border bg-background px-2"
              value={operation.flavor}
              onChange={(event) =>
                saveOperation({
                  ...operation,
                  flavor: event.target.value as StyleTransferFlavor,
                })
              }
            >
              {STYLE_TRANSFER_FLAVORS.map((flavor) => (
                <option key={flavor} value={flavor}>
                  {t(`flavors.${flavor}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {t("controls.engine")}
            <select
              className="nodrag nowheel h-8 rounded-md border bg-background px-2"
              value={operation.engine}
              onChange={(event) =>
                saveOperation({
                  ...operation,
                  engine: event.target.value as StyleTransferEngine,
                })
              }
            >
              {STYLE_TRANSFER_ENGINES.map((engine) => (
                <option key={engine} value={engine}>
                  {t(`engines.${engine}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5">
          <span>{t("controls.fixedGeneration")}</span>
          <input
            className="nodrag"
            type="checkbox"
            checked={operation.fixedGeneration}
            onChange={(event) =>
              saveOperation({
                ...operation,
                fixedGeneration: event.target.checked,
              })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5">
          <span>{t("controls.isPortrait")}</span>
          <input
            className="nodrag"
            type="checkbox"
            checked={operation.isPortrait}
            onChange={(event) =>
              saveOperation({
                ...operation,
                isPortrait: event.target.checked,
              })
            }
          />
        </label>
        {operation.isPortrait ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              {t("controls.portraitStyle")}
              <select
                className="nodrag nowheel h-8 rounded-md border bg-background px-2"
                value={operation.portraitStyle}
                onChange={(event) =>
                  saveOperation({
                    ...operation,
                    portraitStyle: event.target.value as StyleTransferPortraitStyle,
                  })
                }
              >
                {STYLE_TRANSFER_PORTRAIT_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {t(`portraitStyles.${style}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              {t("controls.portraitBeautifier")}
              <select
                className="nodrag nowheel h-8 rounded-md border bg-background px-2"
                value={operation.portraitBeautifier}
                onChange={(event) =>
                  saveOperation({
                    ...operation,
                    portraitBeautifier:
                      event.target.value as StyleTransferPortraitBeautifier,
                  })
                }
              >
                {STYLE_TRANSFER_PORTRAIT_BEAUTIFIERS.map((beautifier) => (
                  <option key={beautifier} value={beautifier}>
                    {t(`portraitBeautifiers.${beautifier}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>
    );
  }

  if (operation.type === "face-restore") {
    return (
      <div className="grid grid-cols-3 gap-1">
        {(["faithful", "creative", "flexible"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`nodrag h-8 rounded-md border px-1 text-[11px] ${
              operation.mode === mode ? "border-teal-500 bg-teal-500/10" : "bg-background"
            }`}
            onClick={() => saveOperation({ ...operation, mode })}
          >
            {t(`faceModes.${mode}`)}
          </button>
        ))}
      </div>
    );
  }

  if (operation.type === "change-camera") {
    return (
      <div className="flex flex-col gap-1.5 text-xs">
        {[
          {
            key: "horizontalAngle" as const,
            min: 0,
            max: 360,
            value: operation.horizontalAngle,
            fillClassName: "accent-sky-500",
            valueClassName: "text-sky-600 dark:text-sky-300",
          },
          {
            key: "verticalAngle" as const,
            min: -30,
            max: 90,
            value: operation.verticalAngle,
            fillClassName: "accent-violet-500",
            valueClassName: "text-violet-600 dark:text-violet-300",
          },
          {
            key: "zoom" as const,
            min: 0,
            max: 10,
            value: operation.zoom,
            fillClassName: "accent-emerald-500",
            valueClassName: "text-emerald-600 dark:text-emerald-300",
          },
        ].map((control) => (
          <label
            key={control.key}
            className="rounded-md border border-border bg-background/70 px-2 py-1"
          >
            <span className="flex items-center justify-between">
              <span className="font-medium">{t(`controls.${control.key}`)}</span>
              <span className={`text-[10px] font-semibold ${control.valueClassName}`}>
                {control.key === "zoom" ? control.value : `${control.value} deg`}
              </span>
            </span>
            <input
              data-testid={`change-camera-control-${control.key}`}
              className={`nodrag nowheel h-4 w-full ${control.fillClassName}`}
              type="range"
              min={control.min}
              max={control.max}
              value={control.value}
              onInput={(event) => {
                const currentOperation = operationRef.current;
                if (currentOperation.type !== "change-camera") return;
                saveOperation({
                  ...currentOperation,
                  [control.key]: Number(event.currentTarget.value),
                });
              }}
            />
          </label>
        ))}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            {t("controls.format")}
            <select
              className="nodrag nowheel h-8 rounded-md border bg-background px-2"
              value={operation.outputFormat}
              onChange={(event) =>
                saveOperation({
                  ...operation,
                  outputFormat: event.target.value as ChangeCameraOutputFormat,
                })
              }
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {t("controls.seed")}
            <input
              className="nodrag nowheel h-8 rounded-md border bg-background px-2"
              type="number"
              min={1}
              value={operation.seed ?? ""}
              placeholder={t("controls.seedPlaceholder")}
              onChange={(event) =>
                saveOperation({
                  ...operation,
                  seed:
                    event.target.value.trim().length > 0
                      ? Number(event.target.value)
                      : undefined,
                })
              }
            />
          </label>
        </div>
      </div>
    );
  }

  return null;
}

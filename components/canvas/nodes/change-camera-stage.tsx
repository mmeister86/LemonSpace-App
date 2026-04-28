import type { ChangeCameraOutputFormat } from "@/lib/image-transform-models";

import type { SourcePreviewMeta } from "./image-transform-node-types";

type ChangeCameraOperation = {
  type: "change-camera";
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
  outputFormat: ChangeCameraOutputFormat;
  seed?: number;
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

type StagePoint = { x: number; y: number };

function polarPoint(center: StagePoint, radiusX: number, radiusY: number, angleDeg: number): StagePoint {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radiusX * Math.cos(radians),
    y: center.y + radiusY * Math.sin(radians),
  };
}

function formatPoint(point: StagePoint): string {
  return `${Math.round(point.x)},${Math.round(point.y)}`;
}

function arcPath(center: StagePoint, radius: number, startAngle: number, endAngle: number): string {
  const start = polarPoint(center, radius, radius, startAngle);
  const end = polarPoint(center, radius, radius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweepFlag = endAngle > startAngle ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

export function ChangeCameraStage({
  operation,
  sourcePreview,
  emptyLabel,
}: {
  operation: ChangeCameraOperation;
  sourcePreview: SourcePreviewMeta | null;
  emptyLabel: string;
}) {
  const horizontalAngle = clampNumber(operation.horizontalAngle, 0, 360);
  const verticalAngle = clampNumber(operation.verticalAngle, -30, 90);
  const zoom = clampNumber(operation.zoom, 0, 10);
  const horizontalProgress = horizontalAngle / 360;
  const verticalProgress = (verticalAngle + 30) / 120;
  const zoomProgress = zoom / 10;
  const focus = { x: 160, y: 70 };
  const orbitCenter = { x: focus.x, y: 92 };
  const orbitRadiusX = 126 - zoomProgress * 24;
  const orbitRadiusY = 42 - zoomProgress * 8;
  const cameraOrbitAngle = 90 - horizontalAngle;
  const cameraPoint = polarPoint(
    orbitCenter,
    orbitRadiusX,
    orbitRadiusY,
    cameraOrbitAngle,
  );
  const tiltRadius = 58;
  const tiltStartAngle = 180 + -30 * 1.25;
  const tiltEndAngle = 180 + 90 * 1.25;
  const tiltMarkerAngle = 180 + verticalAngle * 1.25;
  const tiltPoint = polarPoint(focus, tiltRadius, tiltRadius, tiltMarkerAngle);
  const cameraScale = 0.86 + zoomProgress * 0.34;
  const imageScale = 0.9 + zoomProgress * 0.16;
  const imageRotateY = -18 + horizontalProgress * 36;
  const imageRotateX = -4 - verticalProgress * 12;
  const imageWidth = 74 + zoomProgress * 12;
  const imageHeight = 56 + zoomProgress * 8;
  const imageLeft = focus.x - imageWidth / 2;
  const imageTop = focus.y - imageHeight / 2 - 2;
  const zoomDistance = Math.round(orbitRadiusX);
  const cameraPointText = formatPoint(cameraPoint);
  const tiltPointText = formatPoint(tiltPoint);
  const isCameraBehindImage = cameraPoint.y < orbitCenter.y;
  const cameraDepth = isCameraBehindImage ? "back" : "front";
  const horizontalLabelX = Math.max(8, Math.min(250, cameraPoint.x + 12));
  const horizontalMarker = (
    <g data-testid="change-camera-horizontal-marker-group" data-depth={cameraDepth}>
      <circle
        data-testid="change-camera-horizontal-marker"
        data-orbit-bound="true"
        data-angle={String(horizontalAngle)}
        data-point={cameraPointText}
        data-depth={cameraDepth}
        cx={cameraPoint.x}
        cy={cameraPoint.y}
        r={11 * cameraScale}
        fill="rgb(14 165 233)"
        stroke="rgb(186 230 253)"
        strokeWidth="2"
      />
      <g
        data-testid="change-camera-horizontal-label"
        data-depth={cameraDepth}
        transform={`translate(${horizontalLabelX} ${cameraPoint.y + 2})`}
      >
        <rect x="0" y="-12" width="58" height="22" rx="8" fill="rgb(8 47 73)" opacity="0.82" />
        <text x="9" y="3" fill="rgb(224 242 254)" fontSize="10" fontWeight="700">
          {horizontalAngle} deg
        </text>
      </g>
    </g>
  );

  return (
    <div
      data-testid="change-camera-stage"
      data-geometry="coupled"
      data-horizontal-angle={String(horizontalAngle)}
      data-vertical-angle={String(verticalAngle)}
      data-zoom={String(zoom)}
      data-zoom-distance={String(zoomDistance)}
      className="relative h-40 overflow-hidden rounded-lg border border-sky-500/35 bg-slate-950 text-white shadow-inner shadow-black/30"
    >
      <div
        className="absolute inset-0 z-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          transform: "perspective(360px) rotateX(58deg) translateY(-72px) scale(1.25)",
        }}
      />
      <svg
        data-testid="change-camera-back-layer"
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        viewBox="0 0 320 160"
        aria-hidden="true"
      >
        <ellipse
          data-testid="change-camera-orbit"
          cx={orbitCenter.x}
          cy={orbitCenter.y}
          rx={orbitRadiusX}
          ry={orbitRadiusY}
          fill="none"
          stroke="rgb(14 165 233)"
          strokeWidth="5"
          opacity="0.9"
        />
        <path
          d={arcPath(focus, tiltRadius, tiltStartAngle, tiltEndAngle)}
          fill="none"
          stroke="rgb(139 92 246)"
          strokeLinecap="round"
          strokeWidth="6"
          opacity="0.92"
        />
        <line
          data-testid="change-camera-sightline"
          data-from="camera"
          data-to="image-plane"
          x1={cameraPoint.x}
          y1={cameraPoint.y}
          x2={focus.x}
          y2={focus.y}
          stroke="rgb(125 211 252)"
          strokeDasharray="4 4"
          strokeWidth="1.5"
          opacity="0.55"
        />
        {isCameraBehindImage ? horizontalMarker : null}
      </svg>
      <div
        data-testid="change-camera-image-plane"
        data-layer="image-plane"
        className="absolute z-20 rounded-md border border-white/25 bg-white shadow-2xl shadow-black/40"
        style={{
          left: `${(imageLeft / 320) * 100}%`,
          top: `${(imageTop / 160) * 100}%`,
          width: `${(imageWidth / 320) * 100}%`,
          height: `${(imageHeight / 160) * 100}%`,
          transform: `perspective(260px) rotateX(${imageRotateX}deg) rotateY(${imageRotateY}deg) scale(${imageScale})`,
        }}
      >
        {sourcePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-testid="change-camera-source-preview"
            src={sourcePreview.url}
            alt=""
            className="h-full w-full rounded-[3px] object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-[11px] font-medium text-slate-500">
            {emptyLabel}
          </div>
        )}
      </div>
      <svg
        data-testid="change-camera-front-layer"
        className="pointer-events-none absolute inset-0 z-30 h-full w-full"
        viewBox="0 0 320 160"
        aria-hidden="true"
      >
        {!isCameraBehindImage ? horizontalMarker : null}
        <circle
          data-testid="change-camera-vertical-marker"
          data-arc-bound="true"
          data-angle={String(verticalAngle)}
          data-point={tiltPointText}
          cx={tiltPoint.x}
          cy={tiltPoint.y}
          r="8"
          fill="rgb(139 92 246)"
          stroke="rgb(221 214 254)"
          strokeWidth="2"
        />
        <circle cx={focus.x} cy={focus.y} r="3" fill="rgb(255 255 255)" opacity="0.8" />
        <g transform={`translate(${Math.max(8, tiltPoint.x - 64)} ${tiltPoint.y + 2})`}>
          <rect x="0" y="-12" width="52" height="22" rx="8" fill="rgb(46 16 101)" opacity="0.82" />
          <text x="9" y="3" fill="rgb(237 233 254)" fontSize="10" fontWeight="700">
            {verticalAngle} deg
          </text>
        </g>
        <g transform={`translate(${focus.x - 24} 140)`}>
          <rect x="0" y="-12" width="48" height="22" rx="8" fill="rgb(2 44 34)" opacity="0.82" />
          <text x="19" y="3" fill="rgb(167 243 208)" fontSize="10" fontWeight="700">
            {zoom}
          </text>
        </g>
      </svg>
    </div>
  );
}

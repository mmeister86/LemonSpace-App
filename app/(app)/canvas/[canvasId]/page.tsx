import { notFound, redirect } from "next/navigation";

import Canvas from "@/components/canvas/canvas";
import CanvasToolbar from "@/components/canvas/canvas-toolbar";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    redirect("/auth/sign-in");
  }

  const { canvasId } = await params;
  let typedCanvasId: Id<"canvases">;

  if (/^\d+$/.test(canvasId)) {
    const oneBasedIndex = Number(canvasId);
    if (!Number.isSafeInteger(oneBasedIndex) || oneBasedIndex < 1) {
      notFound();
    }

    const canvases = await fetchAuthQuery(api.canvases.list, {});
    const selectedCanvas = canvases[oneBasedIndex - 1];
    if (!selectedCanvas) {
      notFound();
    }

    typedCanvasId = selectedCanvas._id;
  } else {
    typedCanvasId = canvasId as Id<"canvases">;
  }

  try {
    const canvas = await fetchAuthQuery(api.canvases.get, {
      canvasId: typedCanvasId,
    });
    if (!canvas) {
      notFound();
    }
  } catch {
    notFound();
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <CanvasToolbar canvasId={typedCanvasId} />
      <Canvas canvasId={typedCanvasId} />
    </div>
  );
}

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
  const typedCanvasId = canvasId as Id<"canvases">;

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

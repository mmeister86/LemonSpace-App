/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Onboarding note:
 * Defines the Convex data model and indexes. Keep comments here aligned with every user-facing flow because schema changes ripple into auth, credits, media, and Canvas sync.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  adjustmentPresetNodeTypeValidator,
  nodeTypeValidator,
  phase1NodeTypeValidator,
} from "./node_type_validator";

// ============================================================================
// Node Types
// ============================================================================

// Phase 1 Node Types
const phase1NodeTypes = phase1NodeTypeValidator;

// Alle Node Types (Phase 1 + spätere Phasen)
// Phase 2+3 Typen sind hier schon definiert, damit das Schema nicht bei
// jedem Phasenübergang migriert werden muss. Die UI zeigt nur die Typen
// der jeweiligen Phase an.
const nodeType = nodeTypeValidator;
const adjustmentPresetNodeType = adjustmentPresetNodeTypeValidator;

// Node Status — direkt am Node sichtbar (UX-Strategie aus dem PRD)
const nodeStatus = v.union(
  v.literal("idle"),
  v.literal("analyzing"),
  v.literal("clarifying"),
  v.literal("executing"),
  v.literal("done"),
  v.literal("error")
);

const mediaItemKind = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("asset")
);

const mediaItemSource = v.union(
  v.literal("upload"),
  v.literal("ai-image"),
  v.literal("ai-video"),
  v.literal("freepik-asset"),
  v.literal("pexels-video")
);

const onboardingTourState = v.object({
  status: v.union(
    v.literal("started"),
    v.literal("completed"),
    v.literal("skipped")
  ),
  lastStep: v.optional(v.number()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  skippedAt: v.optional(v.number()),
});

// ============================================================================
// Node Data — typ-spezifische Payloads
// ============================================================================

// Bild-Node: Upload oder URL
const imageNodeData = v.object({
  storageId: v.optional(v.id("_storage")),       // Convex File Storage
  url: v.optional(v.string()),                    // Externe URL
  mimeType: v.optional(v.string()),               // image/png, image/jpeg, image/webp
  originalFilename: v.optional(v.string()),
  width: v.optional(v.number()),                  // Natürliche Bildbreite
  height: v.optional(v.number()),                 // Natürliche Bildhöhe
});

// Text-Node: Freitext mit Markdown
const textNodeData = v.object({
  content: v.string(),
});

// Prompt-Node: Modellinstruktionen
const promptNodeData = v.object({
  content: v.string(),
  model: v.optional(v.string()),                  // OpenRouter Model ID
  modelTier: v.optional(v.union(
    v.literal("budget"),
    v.literal("standard"),
    v.literal("premium")
  )),
});

// KI-Bild-Node: Output einer Bildgenerierung
const aiImageNodeData = v.object({
  storageId: v.optional(v.id("_storage")),        // Generiertes Bild in Convex Storage
  prompt: v.string(),                              // Verwendeter Prompt
  model: v.string(),                               // OpenRouter Model ID
  modelTier: v.union(
    v.literal("budget"),
    v.literal("standard"),
    v.literal("premium")
  ),
  parameters: v.optional(v.any()),                 // Modell-spezifische Parameter
  generationTimeMs: v.optional(v.number()),        // Latenz-Tracking
  creditCost: v.optional(v.number()),              // Tatsächliche Kosten in Credits (Cent)
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  errorMessage: v.optional(v.string()),            // Bei status: "error"
});

// Frame-Node: Artboard mit definierter Auflösung
const frameNodeData = v.object({
  label: v.optional(v.string()),                   // Artboard-Name
  exportWidth: v.number(),                         // Export-Auflösung
  exportHeight: v.number(),
  backgroundColor: v.optional(v.string()),         // Hex-Farbe
});

// Gruppe-Node: Container
const groupNodeData = v.object({
  label: v.optional(v.string()),
  collapsed: v.boolean(),
});

// Notiz-Node: Annotation
const noteNodeData = v.object({
  content: v.string(),                             // Markdown
  color: v.optional(v.string()),                   // Hintergrundfarbe
});

// Compare-Node: Zwei Bilder nebeneinander
const compareNodeData = v.object({
  leftNodeId: v.optional(v.id("nodes")),           // Referenz auf linkes Bild
  rightNodeId: v.optional(v.id("nodes")),          // Referenz auf rechtes Bild
  sliderPosition: v.optional(v.number()),          // 0-100, Default: 50
});

// ============================================================================
// Schema Definition
// ============================================================================

export default defineSchema({

  // ==========================================================================
  // Canvas & Nodes
  // ==========================================================================

  canvases: defineTable({
    name: v.string(),
    ownerId: v.string(),                           // Better Auth User ID
    description: v.optional(v.string()),
    thumbnail: v.optional(v.id("_storage")),       // Canvas-Vorschaubild
    updatedAt: v.number(),                         // Timestamp (ms)
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_updated", ["ownerId", "updatedAt"]),

  nodes: defineTable({
    canvasId: v.id("canvases"),
    type: nodeType,
    // Position & Größe auf dem Canvas
    positionX: v.number(),
    positionY: v.number(),
    width: v.number(),
    height: v.number(),
    // Node-Status (UX-Strategie: Status direkt am Node sichtbar)
    status: nodeStatus,
    statusMessage: v.optional(v.string()),         // z.B. "Timeout — Credits nicht abgebucht"
    retryCount: v.optional(v.number()),            // Anzahl bereits durchgeführter Retries
    // Typ-spezifische Daten
    // Convex empfiehlt v.any() für polymorphe data-Felder
    // Type Safety wird über den `type`-Discriminator + Zod im Frontend sichergestellt
    data: v.any(),
    // Gruppierung
    parentId: v.optional(v.id("nodes")),           // Für Nodes in Gruppen/Frames
    zIndex: v.optional(v.number()),                // Layering-Reihenfolge
  })
    .index("by_canvas", ["canvasId"])
    .index("by_canvas_type", ["canvasId", "type"])
    .index("by_parent", ["parentId"]),

  edges: defineTable({
    canvasId: v.id("canvases"),
    sourceNodeId: v.id("nodes"),
    targetNodeId: v.id("nodes"),
    // Edge-Metadaten
    sourceHandle: v.optional(v.string()),          // Welcher Output-Port
    targetHandle: v.optional(v.string()),          // Welcher Input-Port
    kind: v.optional(v.union(v.literal("data"), v.literal("provenance"))),
  })
    .index("by_canvas", ["canvasId"])
    .index("by_source", ["sourceNodeId"])
    .index("by_target", ["targetNodeId"]),

  mutationRequests: defineTable({
    userId: v.string(),
    mutation: v.string(),
    clientRequestId: v.string(),
    canvasId: v.optional(v.id("canvases")),
    nodeId: v.optional(v.id("nodes")),
    edgeId: v.optional(v.id("edges")),
    createdAt: v.number(),
  }).index("by_user_mutation_request", [
    "userId",
    "mutation",
    "clientRequestId",
  ]),

  adjustmentPresets: defineTable({
    userId: v.string(),
    name: v.string(),
    nodeType: adjustmentPresetNodeType,
    params: v.any(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_nodeType", ["userId", "nodeType"]),

  mediaItems: defineTable({
    ownerId: v.string(),
    kind: mediaItemKind,
    source: mediaItemSource,
    dedupeKey: v.string(),
    title: v.optional(v.string()),
    filename: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    previewStorageId: v.optional(v.id("_storage")),
    originalUrl: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    providerAssetId: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    metadata: v.optional(v.any()),
    firstSourceCanvasId: v.optional(v.id("canvases")),
    firstSourceNodeId: v.optional(v.id("nodes")),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_owner_updated", ["ownerId", "updatedAt"])
    .index("by_owner_kind_updated", ["ownerId", "kind", "updatedAt"])
    .index("by_owner_dedupe", ["ownerId", "dedupeKey"]),

  // ==========================================================================
  // Credit-System
  // ==========================================================================

  creditBalances: defineTable({
    userId: v.string(),                            // Better Auth User ID
    balance: v.number(),                           // Verfügbare Credits (Euro-Cent)
    reserved: v.number(),                          // Gesperrte Credits (laufende Jobs)
    // available = balance - reserved (computed, nicht gespeichert)
    monthlyAllocation: v.number(),                 // Credits aus dem Abo (Cent)
    updatedAt: v.number(),                         // Timestamp (ms)
  })
    .index("by_user", ["userId"]),

  creditTransactions: defineTable({
    userId: v.string(),                            // Better Auth User ID
    amount: v.number(),                            // + = Gutschrift, - = Verbrauch (Cent)
    type: v.union(
      v.literal("subscription"),                   // Monatliche Abo-Gutschrift
      v.literal("topup"),                          // Manueller Nachkauf
      v.literal("usage"),                          // KI-Verbrauch
      v.literal("reservation"),                    // Vorab-Reservierung
      v.literal("refund")                          // Rückerstattung
    ),
    status: v.union(
      v.literal("committed"),                      // Abgeschlossen
      v.literal("reserved"),                       // Reserviert, Job läuft
      v.literal("released"),                       // Reservierung aufgehoben (Fehler)
      v.literal("failed")                          // Fehlgeschlagen
    ),
    description: v.string(),                       // z.B. "Bildgenerierung — Gemini 2.5 Flash Image"
    nodeId: v.optional(v.id("nodes")),             // Auslösender Node
    canvasId: v.optional(v.id("canvases")),        // Zugehöriger Canvas
    openRouterCost: v.optional(v.number()),        // Tatsächliche API-Kosten (Cent)
    model: v.optional(v.string()),                 // OpenRouter Model ID
    provider: v.optional(v.union(v.literal("openrouter"), v.literal("freepik"))),
    videoMeta: v.optional(v.object({
      model: v.string(),
      durationSeconds: v.number(),
      hasAudio: v.boolean(),
    })),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"])
    .index("by_user_status", ["userId", "status"])
    .index("by_status_type", ["status", "type"])
    .index("by_node", ["nodeId"]),

  // ==========================================================================
  // Subscriptions
  // ==========================================================================

  subscriptions: defineTable({
    userId: v.string(),                            // Better Auth User ID
    tier: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("max"),
      v.literal("business")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("past_due"),
      v.literal("trialing")
    ),
    currentPeriodStart: v.number(),                // Timestamp (ms)
    currentPeriodEnd: v.number(),                  // Timestamp (ms)
    polarSubscriptionId: v.optional(v.string()),
    lemonSqueezySubscriptionId: v.optional(v.string()),
    lemonSqueezyCustomerId: v.optional(v.string()),
    cancelAtPeriodEnd: v.optional(v.boolean()),    // Kündigung zum Periodenende
  })
    .index("by_user", ["userId"])
    .index("by_polar", ["polarSubscriptionId"])
    .index("by_lemon_squeezy", ["lemonSqueezySubscriptionId"]),

  webhookIdempotencyEvents: defineTable({
    provider: v.union(v.literal("polar")),
    scope: v.union(
      v.literal("topup_paid"),
      v.literal("subscription_activated_cycle"),
      v.literal("subscription_revoked")
    ),
    idempotencyKey: v.string(),
    userId: v.string(),
    polarOrderId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_provider_key", ["provider", "idempotencyKey"])
    .index("by_user", ["userId"]),

  // ==========================================================================
  // Abuse Prevention
  // ==========================================================================

  dailyUsage: defineTable({
    userId: v.string(),
    date: v.string(),                              // ISO Date: "2026-03-25"
    generationCount: v.number(),                   // Anzahl Generierungen heute
    concurrentJobs: v.number(),                    // Aktuell laufende Jobs
  })
    .index("by_user_date", ["userId", "date"]),

  // ==========================================================================
  // User Settings
  // ==========================================================================

  userSettings: defineTable({
    userId: v.string(),                            // Better Auth User ID
    locale: v.optional(v.union(v.literal('de'), v.literal('en'))),
    onboarding: v.optional(v.object({
      dashboardTour: v.optional(onboardingTourState),
      canvasTour: v.optional(onboardingTourState),
      firstWorkspaceCreatedAt: v.optional(v.number()),
      firstOutputCreatedAt: v.optional(v.number()),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),
});

// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    React.createElement("img", { alt, src }),
}));

import { InstagramPost } from "@/components/agents/instagram/ui/instagram-post";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("InstagramPost", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("does not render synthetic or bare node ids as browser image sources", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }

    await act(async () => {
      root?.render(
        React.createElement(InstagramPost, {
          username: "lemonspace",
          profileImageUrl: "synthetic-profile-image",
          imageUrl: "js72cvr5aefg5mx61k5fcve1wh88b7jp",
          caption: "Caption",
          hashtags: [],
        }),
      );
    });

    const imageSources = Array.from(container.querySelectorAll("img")).map((image) =>
      image.getAttribute("src"),
    );
    expect(imageSources).not.toContain("synthetic-profile-image");
    expect(imageSources).not.toContain("js72cvr5aefg5mx61k5fcve1wh88b7jp");
  });

  it("renders absolute image URLs", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }

    await act(async () => {
      root?.render(
        React.createElement(InstagramPost, {
          username: "lemonspace",
          profileImageUrl: "https://example.com/profile.png",
          imageUrl: "https://example.com/post.png",
          caption: "Caption",
          hashtags: [],
        }),
      );
    });

    const imageSources = Array.from(container.querySelectorAll("img")).map((image) =>
      image.getAttribute("src"),
    );
    expect(imageSources).toContain("https://example.com/profile.png");
    expect(imageSources).toContain("https://example.com/post.png");
  });

  it("uses a portrait 4:5 image area when requested", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }

    await act(async () => {
      root?.render(
        React.createElement(InstagramPost, {
          username: "lemonspace",
          imageUrl: "https://example.com/post.png",
          imageAspectRatio: "portrait-4-5",
          caption: "Caption",
          hashtags: [],
        }),
      );
    });

    const imageArea = container.querySelector('[data-testid="instagram-post-image-area"]');
    expect(imageArea?.className).toContain("aspect-[4/5]");
    expect(imageArea?.className).not.toContain("aspect-square");
  });

  it("allows the preview card to fill its parent width", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }

    await act(async () => {
      root?.render(
        React.createElement(InstagramPost, {
          username: "lemonspace",
          imageUrl: "https://example.com/post.png",
          caption: "Caption",
          hashtags: [],
        }),
      );
    });

    const card = container.firstElementChild as HTMLElement | null;
    expect(card?.className).toContain("w-full");
    expect(card?.className).not.toContain("max-w-[470px]");
  });
});

// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAuthQuery: vi.fn(),
  resolveUrls: vi.fn(async () => ({})),
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.resolveUrls,
}));

vi.mock("@/hooks/use-auth-query", () => ({
  useAuthQuery: (...args: unknown[]) => mocks.useAuthQuery(...args),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

import { MediaLibraryDialog } from "@/components/media/media-library-dialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeItems(count: number, page = 1) {
  return Array.from({ length: count }).map((_, index) => ({
    kind: "image" as const,
    source: "upload" as const,
    filename: `Item ${page}-${index + 1}`,
    previewUrl: `https://cdn.example.com/${page}-${index + 1}.jpg`,
    width: 1200,
    height: 800,
    createdAt: page * 1000 + index,
  }));
}

describe("MediaLibraryDialog", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.useAuthQuery.mockReset();
    mocks.resolveUrls.mockReset();
    mocks.resolveUrls.mockImplementation(async () => ({}));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("calls media library query with page and default pageSize 8", async () => {
    mocks.useAuthQuery.mockReturnValue(undefined);

    await act(async () => {
      root?.render(
        <MediaLibraryDialog open onOpenChange={() => undefined} kindFilter="image" />,
      );
    });

    const firstCallArgs = mocks.useAuthQuery.mock.calls[0]?.[1];
    expect(firstCallArgs).toEqual(
      expect.objectContaining({
        page: 1,
        pageSize: 8,
        kindFilter: "image",
      }),
    );
  });

  it("renders at most 8 cards and shows Freepik-style pagination footer", async () => {
    mocks.useAuthQuery.mockReturnValue({
      items: makeItems(10),
      page: 1,
      pageSize: 8,
      totalPages: 3,
      totalCount: 24,
    });

    await act(async () => {
      root?.render(<MediaLibraryDialog open onOpenChange={() => undefined} />);
    });

    const cards = document.querySelectorAll("img[alt^='Item 1-']");
    expect(cards).toHaveLength(8);

    expect(document.body.textContent).toContain("Previous");
    expect(document.body.textContent).toContain("Page 1 of 3");
    expect(document.body.textContent).toContain("Next");
  });

  it("updates query args when clicking next and previous", async () => {
    const responseByPage = new Map<number, {
      items: ReturnType<typeof makeItems>;
      page: number;
      pageSize: number;
      totalPages: number;
      totalCount: number;
    }>();

    mocks.useAuthQuery.mockImplementation((_, args: { page: number; pageSize: number }) => {
      if (!responseByPage.has(args.page)) {
        responseByPage.set(args.page, {
          items: makeItems(8, args.page),
          page: args.page,
          pageSize: args.pageSize,
          totalPages: 3,
          totalCount: 24,
        });
      }

      return responseByPage.get(args.page);
    });

    await act(async () => {
      root?.render(<MediaLibraryDialog open onOpenChange={() => undefined} />);
    });

    const nextButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Next",
    );
    if (!(nextButton instanceof HTMLButtonElement)) {
      throw new Error("Next button not found");
    }

    await act(async () => {
      nextButton.click();
    });

    const nextCallArgs = mocks.useAuthQuery.mock.calls.at(-1)?.[1];
    expect(nextCallArgs).toEqual(expect.objectContaining({ page: 2, pageSize: 8 }));

    const previousButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Previous",
    );
    if (!(previousButton instanceof HTMLButtonElement)) {
      throw new Error("Previous button not found");
    }

    await act(async () => {
      previousButton.click();
    });

    const previousCallArgs = mocks.useAuthQuery.mock.calls.at(-1)?.[1];
    expect(previousCallArgs).toEqual(expect.objectContaining({ page: 1, pageSize: 8 }));
  });

  it("renders 8 loading skeleton cards", async () => {
    mocks.useAuthQuery.mockReturnValue(undefined);

    await act(async () => {
      root?.render(<MediaLibraryDialog open onOpenChange={() => undefined} />);
    });

    expect(document.querySelectorAll(".aspect-square.animate-pulse.bg-muted")).toHaveLength(8);
  });
});

import React from "react";
import { describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  getAuthUser: vi.fn(),
}));

const sentryMocks = vi.hoisted(() => ({
  setUser: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => authMocks);

vi.mock("@sentry/nextjs", () => sentryMocks);

vi.mock("@/components/providers", () => ({
  AppProviders: ({
    children,
    initialToken,
  }: {
    children: React.ReactNode;
    initialToken: string | null;
  }) => React.createElement("div", { "data-token": initialToken }, children),
}));

vi.mock("@/components/init-user", () => ({
  InitUser: () => React.createElement("span", { "data-testid": "init-user" }),
}));

describe("authenticated app layouts", () => {
  it("renders the authenticated app shell when SSR auth user lookup hits a Convex auth provider race", async () => {
    authMocks.getToken.mockResolvedValue("token-1");
    authMocks.getAuthUser.mockRejectedValue(
      new Error('{"code":"NoAuthProvider","message":"No auth provider found matching the given token"}'),
    );

    const { default: AuthenticatedAppLayout } = await import("@/app/(app)/layout");

    await expect(
      AuthenticatedAppLayout({
        children: React.createElement("main", null, "Canvas"),
      }),
    ).resolves.toMatchObject({
      props: {
        initialToken: "token-1",
      },
    });
    expect(sentryMocks.setUser).toHaveBeenCalledWith(null);
  });
});

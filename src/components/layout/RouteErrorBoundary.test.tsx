import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function Boom({ when }: { when: boolean }) {
  if (when) throw new Error("kaboom user@example.com bearer abc123");
  return <div>ok</div>;
}

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error", () => {
    render(
      <RouteErrorBoundary routeKey="/a">
        <Boom when={false} />
      </RouteErrorBoundary>
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("shows fallback UI on crash with safe message and home button", () => {
    render(
      <RouteErrorBoundary routeKey="/a">
        <Boom when={true} />
      </RouteErrorBoundary>
    );
    expect(screen.getByText(/Algo falhou ao renderizar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voltar ao Painel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeInTheDocument();
  });

  it("redacts PII from console.error", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <RouteErrorBoundary routeKey="/a">
        <Boom when={true} />
      </RouteErrorBoundary>
    );
    const calls = errSpy.mock.calls.flat().map((c) => (typeof c === "string" ? c : JSON.stringify(c)));
    const joined = calls.join(" ");
    expect(joined).not.toContain("user@example.com");
    expect(joined).not.toContain("abc123");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

describe("App Component — Portal shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("wormhole_setup_complete", "true");
  });

  describe("Chrome", () => {
    it("has no left sidebar navigation", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Portal" })).toBeInTheDocument();
      });

      expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    });
  });

  describe("Portal empty state", () => {
    it("shows Portal brand composition", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Portal" })).toBeInTheDocument();
      });

      expect(screen.getAllByText("Share a folder").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Enter a code").length).toBeGreaterThan(0);
      expect(screen.getByText(/this is the tunnel/i)).toBeInTheDocument();
    });

    it("skips wizard when setup is complete", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.queryByText("Welcome to Wormhole")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Portal" })).toBeInTheDocument();
      });
    });
  });

  describe("Setup Wizard", () => {
    it("shows setup wizard on first launch", async () => {
      localStorage.removeItem("wormhole_setup_complete");

      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Welcome to Wormhole")).toBeInTheDocument();
      });
    });
  });

  describe("User Interactions", () => {
    it("Share and Enter code CTAs are clickable", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getAllByText("Enter a code").length).toBeGreaterThan(0);
      });

      const shareBtn = screen.getAllByText("Share a folder")[0]?.closest("button");
      const connectBtn = screen.getAllByText("Enter a code")[0]?.closest("button");
      expect(shareBtn).not.toBeDisabled();
      expect(connectBtn).not.toBeDisabled();
    });

    it("Settings opens from Portal header", async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: "Settings" }));

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
        expect(screen.getByText("← Portal")).toBeInTheDocument();
      });
    });
  });
});

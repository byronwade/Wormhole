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

  describe("Sidebar Navigation", () => {
    it("renders Portal-first navigation", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getAllByText("Portal").length).toBeGreaterThan(0);
      });

      expect(screen.getByText("Settings")).toBeInTheDocument();
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

      expect(screen.getByText("Share a folder")).toBeInTheDocument();
      expect(screen.getByText("Enter a code")).toBeInTheDocument();
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
        expect(screen.getByText("Enter a code")).toBeInTheDocument();
      });

      expect(screen.getByText("Share a folder").closest("button")).not.toBeDisabled();
      expect(screen.getByText("Enter a code").closest("button")).not.toBeDisabled();
    });

    it("Settings nav is interactive", async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });

      const settings = screen.getByText("Settings").closest("button");
      if (settings) await user.click(settings);

      await waitFor(() => {
        expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
      });
    });
  });

  describe("Accessibility", () => {
    it("main navigation is present", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
      });
    });
  });
});

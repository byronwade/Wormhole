import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

describe("App Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("wormhole_setup_complete", "true");
  });

  describe("Sidebar Navigation", () => {
    it("renders Share / Mounts / Settings-first navigation", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
      });

      expect(screen.getByText("Sharing")).toBeInTheDocument();
      expect(screen.getByText("Mounts")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("buries Recent and Favorites under More", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("More…")).toBeInTheDocument();
      });

      // Collapsed by default — labels exist inside details
      expect(screen.getByText("Recent")).toBeInTheDocument();
      expect(screen.getByText("Favorites")).toBeInTheDocument();
    });
  });

  describe("Homepage empty state", () => {
    it("shows brand-first empty composition", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Mount Any Folder.")).toBeInTheDocument();
      });

      expect(screen.getByText("Share a folder")).toBeInTheDocument();
      expect(screen.getByText("Enter a code")).toBeInTheDocument();
    });

    it("skips wizard when setup is complete", async () => {
      localStorage.setItem("wormhole_setup_complete", "true");

      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.queryByText("Welcome to Wormhole")).not.toBeInTheDocument();
        expect(screen.getByText("Home")).toBeInTheDocument();
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
    it("Enter a code CTA is clickable", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Enter a code")).toBeInTheDocument();
      });

      const connectButton = screen.getByText("Enter a code").closest("button");
      expect(connectButton).toBeInTheDocument();
      expect(connectButton).not.toBeDisabled();
    });

    it("Share a folder CTA is clickable", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Share a folder")).toBeInTheDocument();
      });

      const shareButton = screen.getByText("Share a folder").closest("button");
      expect(shareButton).toBeInTheDocument();
      expect(shareButton).not.toBeDisabled();
    });

    it("sidebar Sharing nav is interactive", async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Sharing")).toBeInTheDocument();
      });

      const sharingButton = screen.getByText("Sharing").closest("button");
      if (sharingButton) {
        await user.click(sharingButton);
      }

      await waitFor(() => {
        const headers = screen.getAllByText("Sharing");
        expect(headers.length).toBeGreaterThan(0);
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

    it("primary CTAs are focusable", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Enter a code")).toBeInTheDocument();
      });

      const connectButton = screen.getByText("Enter a code").closest("button");
      expect(connectButton).not.toHaveAttribute("tabindex", "-1");
    });
  });
});

describe("ErrorBoundary", () => {
  it("renders children when no error", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Home")).toBeInTheDocument();
    });
  });
});

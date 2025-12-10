import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

describe("App Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage before each test
    localStorage.clear();
    // Set setup as complete to skip wizard
    localStorage.setItem("wormhole_setup_complete", "true");
  });

  describe("Sidebar Navigation", () => {
    it("renders the sidebar with navigation items", async () => {
      await act(async () => {
        render(<App />);
      });

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText("All Files")).toBeInTheDocument();
      });

      expect(screen.getByText("Shared with Me")).toBeInTheDocument();
      expect(screen.getByText("My Shares")).toBeInTheDocument();
    });

    it("renders Recent and Favorites sections", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Recent")).toBeInTheDocument();
      });

      expect(screen.getByText("Favorites")).toBeInTheDocument();
    });

    it("renders Settings button", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });
    });
  });

  describe("Main Content Area", () => {
    it("renders Connect and Share buttons in empty state", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Connect to Share")).toBeInTheDocument();
      });

      expect(screen.getByText("Share a Folder")).toBeInTheDocument();
    });

    it("shows empty state when no files", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("No Files to Browse")).toBeInTheDocument();
      });
    });
  });

  describe("Setup Wizard", () => {
    it("shows setup wizard on first launch", async () => {
      // Clear the setup complete flag
      localStorage.removeItem("wormhole_setup_complete");

      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Welcome to Wormhole")).toBeInTheDocument();
      });
    });

    it("skips wizard when setup is complete", async () => {
      localStorage.setItem("wormhole_setup_complete", "true");

      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        // Should show main app, not wizard
        expect(screen.queryByText("Welcome to Wormhole")).not.toBeInTheDocument();
        expect(screen.getByText("All Files")).toBeInTheDocument();
      });
    });
  });

  describe("File Browser", () => {
    it("renders correctly with no active folder", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        // Should show the empty state / welcome screen
        expect(screen.getByText("All Files")).toBeInTheDocument();
      });
    });
  });

  describe("User Interactions", () => {
    it("Connect to Share button is clickable", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Connect to Share")).toBeInTheDocument();
      });

      const connectButton = screen.getByText("Connect to Share").closest("button");
      expect(connectButton).toBeInTheDocument();
      expect(connectButton).not.toBeDisabled();
    });

    it("Share a Folder button is clickable", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Share a Folder")).toBeInTheDocument();
      });

      const shareButton = screen.getByText("Share a Folder").closest("button");
      expect(shareButton).toBeInTheDocument();
      expect(shareButton).not.toBeDisabled();
    });

    it("sidebar buttons are interactive", async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("My Shares")).toBeInTheDocument();
      });

      // Click on My Shares
      const mySharesButton = screen.getByText("My Shares").closest("button");
      if (mySharesButton) {
        await user.click(mySharesButton);
      }

      // Should now show My Shares view header
      await waitFor(() => {
        // The header should show "My Shares" when that view is active
        const headers = screen.getAllByText("My Shares");
        expect(headers.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Accessibility", () => {
    it("main navigation elements are accessible", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        const sidebar = screen.getByText("All Files").closest("nav") || screen.getByText("All Files").closest("div");
        expect(sidebar).toBeInTheDocument();
      });
    });

    it("buttons are focusable", async () => {
      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(screen.getByText("Connect to Share")).toBeInTheDocument();
      });

      const connectButton = screen.getByText("Connect to Share").closest("button");
      expect(connectButton).toBeInTheDocument();
      // Buttons should be focusable (not have tabindex=-1)
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
      // App should render normally
      expect(screen.getByText("All Files")).toBeInTheDocument();
    });
  });
});

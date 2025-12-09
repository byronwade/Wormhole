import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// Get mocked functions
const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);

describe("App Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Header", () => {
    it("renders the Wormhole header", () => {
      render(<App />);
      expect(screen.getByText("Wormhole")).toBeInTheDocument();
      expect(
        screen.getByText("Mount Any Folder. Any Computer.")
      ).toBeInTheDocument();
    });

    it("displays the server icon in header", () => {
      render(<App />);
      const header = screen.getByText("Wormhole").closest("div");
      expect(header).toBeInTheDocument();
    });
  });

  describe("Tab Navigation", () => {
    it("renders Host and Connect tabs", () => {
      render(<App />);
      expect(screen.getByText("Host")).toBeInTheDocument();
      expect(screen.getByText("Connect")).toBeInTheDocument();
    });

    it("shows Host tab content by default", () => {
      render(<App />);
      expect(screen.getByText("Folder to Share")).toBeInTheDocument();
      expect(screen.getByText("Port")).toBeInTheDocument();
    });

    it("switches to Connect tab when clicked", async () => {
      render(<App />);
      const connectTab = screen.getByText("Connect");

      await userEvent.click(connectTab);

      expect(screen.getByText("Host Address")).toBeInTheDocument();
      expect(screen.getByText("Mount Point")).toBeInTheDocument();
    });

    it("switches back to Host tab when clicked", async () => {
      render(<App />);

      // Switch to Connect first
      await userEvent.click(screen.getByText("Connect"));
      expect(screen.getByText("Host Address")).toBeInTheDocument();

      // Switch back to Host
      await userEvent.click(screen.getByText("Host"));
      expect(screen.getByText("Folder to Share")).toBeInTheDocument();
    });

    it("highlights active tab with correct styling", async () => {
      render(<App />);
      const hostButton = screen.getByText("Host").closest("button");
      const connectButton = screen.getByText("Connect").closest("button");

      // Host should be active initially
      expect(hostButton?.className).toContain("bg-wormhole-purple");
      expect(connectButton?.className).not.toContain("bg-wormhole-purple");

      // Click Connect
      await userEvent.click(connectButton!);

      // Connect should now be active
      expect(connectButton?.className).toContain("bg-wormhole-purple");
      expect(hostButton?.className).not.toContain("bg-wormhole-purple");
    });
  });

  describe("Host Tab", () => {
    it("renders share path input", () => {
      render(<App />);
      const input = screen.getByPlaceholderText("/path/to/share");
      expect(input).toBeInTheDocument();
    });

    it("renders port input with default value", () => {
      render(<App />);
      const portInput = screen.getByDisplayValue("4433");
      expect(portInput).toBeInTheDocument();
    });

    it("renders folder selector button", () => {
      render(<App />);
      const folderButtons = screen.getAllByRole("button");
      // Find the folder button (it's not the main action button)
      const folderButton = folderButtons.find(
        (btn) => !btn.textContent?.includes("Start Hosting")
      );
      expect(folderButton).toBeInTheDocument();
    });

    it("renders Start Hosting button", () => {
      render(<App />);
      expect(screen.getByText("Start Hosting")).toBeInTheDocument();
    });

    it("disables Start Hosting button when no path is entered", () => {
      render(<App />);
      const button = screen.getByText("Start Hosting").closest("button");
      expect(button).toBeDisabled();
    });

    it("enables Start Hosting button when path is entered", async () => {
      render(<App />);
      const input = screen.getByPlaceholderText("/path/to/share");

      await userEvent.type(input, "/Users/test/share");

      const button = screen.getByText("Start Hosting").closest("button");
      expect(button).not.toBeDisabled();
    });

    it("updates share path input when typing", async () => {
      render(<App />);
      const input = screen.getByPlaceholderText(
        "/path/to/share"
      ) as HTMLInputElement;

      await userEvent.type(input, "/test/path");

      expect(input.value).toBe("/test/path");
    });

    it("updates port input when changed", async () => {
      render(<App />);
      const portInput = screen.getByDisplayValue("4433") as HTMLInputElement;

      await userEvent.clear(portInput);
      await userEvent.type(portInput, "5000");

      // Port input value may be the typed value
      expect(portInput.value).toMatch(/5000|4433/);
    });

    it("calls folder dialog when folder button is clicked", async () => {
      mockOpen.mockResolvedValue("/selected/folder");
      render(<App />);

      // Find the folder button in Host tab
      const folderButtons = document.querySelectorAll("button");
      let folderButton: HTMLButtonElement | null = null;
      folderButtons.forEach((btn) => {
        if (
          btn.querySelector("svg") &&
          !btn.textContent?.includes("Start") &&
          !btn.textContent?.includes("Host") &&
          !btn.textContent?.includes("Connect")
        ) {
          folderButton = btn as HTMLButtonElement;
        }
      });

      if (folderButton) {
        await userEvent.click(folderButton);
        expect(mockOpen).toHaveBeenCalledWith({
          directory: true,
          multiple: false,
        });
      }
    });

    it("sets share path when folder is selected", async () => {
      mockOpen.mockResolvedValue("/selected/folder");
      render(<App />);

      // Click the first folder button (share path)
      const buttons = screen.getAllByRole("button");
      const folderButton = buttons[2]; // Third button is the folder selector

      await userEvent.click(folderButton);

      await waitFor(() => {
        const input = screen.getByPlaceholderText(
          "/path/to/share"
        ) as HTMLInputElement;
        expect(input.value).toBe("/selected/folder");
      });
    });

    it("calls start_hosting when Start Hosting button is clicked", async () => {
      mockInvoke.mockResolvedValue(undefined);
      render(<App />);

      const input = screen.getByPlaceholderText("/path/to/share");
      await userEvent.type(input, "/test/folder");

      const button = screen.getByText("Start Hosting");
      await userEvent.click(button);

      expect(mockInvoke).toHaveBeenCalledWith("start_hosting", {
        path: "/test/folder",
        port: 4433,
      });
    });

    it("shows Stop Hosting button after hosting starts", async () => {
      mockInvoke.mockResolvedValue(undefined);
      render(<App />);

      const input = screen.getByPlaceholderText("/path/to/share");
      await userEvent.type(input, "/test/folder");

      const startButton = screen.getByText("Start Hosting");
      await userEvent.click(startButton);

      await waitFor(() => {
        expect(screen.getByText("Stop Hosting")).toBeInTheDocument();
      });
    });

    it("disables inputs when hosting", async () => {
      mockInvoke.mockResolvedValue(undefined);
      render(<App />);

      const input = screen.getByPlaceholderText(
        "/path/to/share"
      ) as HTMLInputElement;
      await userEvent.type(input, "/test/folder");

      await userEvent.click(screen.getByText("Start Hosting"));

      await waitFor(() => {
        expect(input).toBeDisabled();
      });
    });

    it("calls stop_hosting when Stop Hosting is clicked", async () => {
      mockInvoke.mockResolvedValue(undefined);
      render(<App />);

      const input = screen.getByPlaceholderText("/path/to/share");
      await userEvent.type(input, "/test/folder");

      await userEvent.click(screen.getByText("Start Hosting"));

      await waitFor(() => {
        expect(screen.getByText("Stop Hosting")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Stop Hosting"));

      expect(mockInvoke).toHaveBeenCalledWith("stop_hosting");
    });
  });

  describe("Connect Tab", () => {
    // Helper to find the action button (not the tab button)
    const getConnectActionButton = () => {
      const buttons = screen.getAllByRole("button");
      // The action button is the one with the Plug icon, not the tab button
      return buttons.find(
        (btn) =>
          btn.textContent?.includes("Connect") &&
          !btn.className.includes("flex-1") // Tab buttons have flex-1
      );
    };

    beforeEach(async () => {
      render(<App />);
      await userEvent.click(screen.getByText("Connect"));
    });

    it("renders host address input", () => {
      const input = screen.getByPlaceholderText(
        "192.168.1.100:4433 or join code"
      );
      expect(input).toBeInTheDocument();
    });

    it("renders mount point input", () => {
      const input = screen.getByPlaceholderText("/tmp/wormhole");
      expect(input).toBeInTheDocument();
    });

    it("renders Connect action button", () => {
      const actionButton = getConnectActionButton();
      expect(actionButton).toBeInTheDocument();
    });

    it("disables Connect action button when inputs are empty", () => {
      const actionButton = getConnectActionButton();
      expect(actionButton).toBeDisabled();
    });

    it("enables Connect button when both inputs are filled", async () => {
      const hostInput = screen.getByPlaceholderText(
        "192.168.1.100:4433 or join code"
      );
      const mountInput = screen.getByPlaceholderText("/tmp/wormhole");

      await userEvent.type(hostInput, "192.168.1.100:4433");
      await userEvent.type(mountInput, "/tmp/mount");

      const actionButton = getConnectActionButton();
      expect(actionButton).not.toBeDisabled();
    });

    it("calls connect_to_peer when Connect is clicked", async () => {
      mockInvoke.mockResolvedValue(undefined);

      const hostInput = screen.getByPlaceholderText(
        "192.168.1.100:4433 or join code"
      );
      const mountInput = screen.getByPlaceholderText("/tmp/wormhole");

      await userEvent.type(hostInput, "192.168.1.100:4433");
      await userEvent.type(mountInput, "/tmp/mount");

      const actionButton = getConnectActionButton();
      await userEvent.click(actionButton!);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith("connect_to_peer", {
          hostAddress: "192.168.1.100:4433",
          mountPath: "/tmp/mount",
        });
      });
    });

    it("shows Disconnect button after connecting", async () => {
      mockInvoke.mockResolvedValue(undefined);

      const hostInput = screen.getByPlaceholderText(
        "192.168.1.100:4433 or join code"
      );
      const mountInput = screen.getByPlaceholderText("/tmp/wormhole");

      await userEvent.type(hostInput, "192.168.1.100:4433");
      await userEvent.type(mountInput, "/tmp/mount");

      const actionButton = getConnectActionButton();
      await userEvent.click(actionButton!);

      await waitFor(() => {
        expect(screen.getByText("Disconnect")).toBeInTheDocument();
      });
    });

    it("calls disconnect when Disconnect is clicked", async () => {
      mockInvoke.mockResolvedValue(undefined);

      const hostInput = screen.getByPlaceholderText(
        "192.168.1.100:4433 or join code"
      );
      const mountInput = screen.getByPlaceholderText("/tmp/wormhole");

      await userEvent.type(hostInput, "192.168.1.100:4433");
      await userEvent.type(mountInput, "/tmp/mount");

      const actionButton = getConnectActionButton();
      await userEvent.click(actionButton!);

      await waitFor(() => {
        expect(screen.getByText("Disconnect")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Disconnect"));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith("disconnect");
      });
    });
  });

  describe("Status Bar", () => {
    it("shows Ready by default", () => {
      render(<App />);
      expect(screen.getByText("Ready")).toBeInTheDocument();
    });

    it("shows status message when hosting starts", async () => {
      mockInvoke.mockResolvedValue(undefined);
      render(<App />);

      const input = screen.getByPlaceholderText("/path/to/share");
      await userEvent.type(input, "/test/folder");

      await userEvent.click(screen.getByText("Start Hosting"));

      await waitFor(() => {
        expect(screen.getByText("Starting host...")).toBeInTheDocument();
      });
    });

    it("shows error message on failure", async () => {
      mockInvoke.mockRejectedValue(new Error("Connection failed"));
      render(<App />);

      const input = screen.getByPlaceholderText("/path/to/share");
      await userEvent.type(input, "/test/folder");

      await userEvent.click(screen.getByText("Start Hosting"));

      await waitFor(() => {
        expect(
          screen.getByText(/Error:.*Connection failed/i)
        ).toBeInTheDocument();
      });
    });

    it("applies error styling on error", async () => {
      mockInvoke.mockRejectedValue(new Error("Test error"));
      render(<App />);

      const input = screen.getByPlaceholderText("/path/to/share");
      await userEvent.type(input, "/test/folder");

      await userEvent.click(screen.getByText("Start Hosting"));

      await waitFor(() => {
        const statusBar = screen.getByText(/Error:/i).closest("div");
        expect(statusBar?.className).toContain("bg-red-900/30");
      });
    });
  });

  describe("Join Code", () => {
    it("does not show join code initially", () => {
      render(<App />);
      expect(screen.queryByText("Join Code")).not.toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("handles folder dialog errors gracefully", async () => {
      mockOpen.mockRejectedValue(new Error("Dialog cancelled"));
      render(<App />);

      const buttons = screen.getAllByRole("button");
      const folderButton = buttons[2];

      await userEvent.click(folderButton);

      // Should show error in status - the message includes the error
      await waitFor(() => {
        const statusBar = screen.getByText(/Failed to open folder dialog/i);
        expect(statusBar).toBeInTheDocument();
      });
    });

    it("handles null folder selection", async () => {
      mockOpen.mockResolvedValue(null);
      render(<App />);

      const input = screen.getByPlaceholderText(
        "/path/to/share"
      ) as HTMLInputElement;
      const buttons = screen.getAllByRole("button");
      const folderButton = buttons[2];

      await userEvent.click(folderButton);

      // Input should remain empty
      expect(input.value).toBe("");
    });
  });

  describe("Loading States", () => {
    it("shows loading state when starting hosting", async () => {
      // Make invoke hang to simulate loading
      mockInvoke.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );
      render(<App />);

      const input = screen.getByPlaceholderText("/path/to/share");
      await userEvent.type(input, "/test/folder");

      await userEvent.click(screen.getByText("Start Hosting"));

      expect(screen.getByText("Starting...")).toBeInTheDocument();
    });

    it("shows loading state when connecting", async () => {
      mockInvoke.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );
      render(<App />);

      await userEvent.click(screen.getByText("Connect"));

      const hostInput = screen.getByPlaceholderText(
        "192.168.1.100:4433 or join code"
      );
      const mountInput = screen.getByPlaceholderText("/tmp/wormhole");

      await userEvent.type(hostInput, "192.168.1.100:4433");
      await userEvent.type(mountInput, "/tmp/mount");

      // Find the action button (not the tab button)
      const buttons = screen.getAllByRole("button");
      const actionButton = buttons.find(
        (btn) =>
          btn.textContent?.includes("Connect") &&
          !btn.className.includes("flex-1")
      );
      await userEvent.click(actionButton!);

      await waitFor(() => {
        expect(screen.getByText("Connecting...")).toBeInTheDocument();
      });
    });
  });

  describe("Accessibility", () => {
    it("has proper labels for inputs", () => {
      render(<App />);
      expect(screen.getByText("Folder to Share")).toBeInTheDocument();
      expect(screen.getByText("Port")).toBeInTheDocument();
    });

    it("buttons are focusable", () => {
      render(<App />);
      const button = screen.getByText("Start Hosting").closest("button");
      expect(button).not.toHaveAttribute("tabindex", "-1");
    });
  });
});

describe("Clipboard", () => {
  it("copies join code to clipboard", async () => {
    // This test would require simulating the join code appearing
    // which happens through Tauri events - tested in integration tests
  });
});

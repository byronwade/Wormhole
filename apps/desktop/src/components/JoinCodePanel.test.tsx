import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinCodePanel } from "./JoinCodePanel";

describe("JoinCodePanel", () => {
  it("renders formatted join code", () => {
    render(<JoinCodePanel code="ABC234" showQr={false} />);
    expect(screen.getByLabelText(/Join code ABC-234/i)).toBeInTheDocument();
  });

  it("shows QR when enabled", () => {
    render(<JoinCodePanel code="ABC234" showQr />);
    expect(screen.getByTitle(/QR code for join code ABC-234/i)).toBeInTheDocument();
  });

  it("exposes copy join code control", async () => {
    const user = userEvent.setup();
    render(<JoinCodePanel code="ABC234" showQr={false} />);
    const copyBtn = screen.getByLabelText("Copy join code");
    expect(copyBtn).toBeEnabled();
    await user.click(copyBtn);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});

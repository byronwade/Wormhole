import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MountStatusStrip } from "./MountStatusStrip";

describe("MountStatusStrip", () => {
  it("shows mount path and Open Finder CTA", async () => {
    const onOpenFinder = vi.fn();
    const user = userEvent.setup();
    render(
      <MountStatusStrip
        mountPath="/home/test/Wormhole/ABC234"
        peerLabel="ABC-234"
        onOpenFinder={onOpenFinder}
      />,
    );

    expect(screen.getByText("/home/test/Wormhole/ABC234")).toBeInTheDocument();
    expect(screen.getByText("ABC-234")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Open in Finder/i }));
    expect(onOpenFinder).toHaveBeenCalled();
  });
});

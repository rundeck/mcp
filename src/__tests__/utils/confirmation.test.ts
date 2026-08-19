import { jest } from "@jest/globals";
import type { Server } from "@modelcontextprotocol/server";
import { requestDestructiveConfirmation, type DestructiveAction } from "../../utils/confirmation.js";

function fakeServer(overrides: {
  getClientCapabilities: Server["getClientCapabilities"];
  elicitInput: Server["elicitInput"];
}): Server {
  return overrides as unknown as Server;
}

const action: DestructiveAction = {
  phrase: "permanently delete job 'my-job'",
  consequence: "Rundeck's API has no undo for this.",
};

describe("requestDestructiveConfirmation", () => {
  const originalSkipElicitation = process.env.SKIP_ELICITATION;

  afterEach(() => {
    if (originalSkipElicitation === undefined) {
      delete process.env.SKIP_ELICITATION;
    } else {
      process.env.SKIP_ELICITATION = originalSkipElicitation;
    }
  });

  it.each(["1", "true"])("returns 'confirmed' without asking when SKIP_ELICITATION=%s", async (value) => {
    process.env.SKIP_ELICITATION = value;
    const elicitInput = jest.fn<Server["elicitInput"]>();
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    const outcome = await requestDestructiveConfirmation(server, action);

    expect(outcome).toBe("confirmed");
    expect(elicitInput).not.toHaveBeenCalled();
  });

  it("does not bypass confirmation for other SKIP_ELICITATION values", async () => {
    process.env.SKIP_ELICITATION = "yes";
    const elicitInput = jest.fn<Server["elicitInput"]>();
    const server = fakeServer({
      getClientCapabilities: () => ({}),
      elicitInput,
    });

    expect(await requestDestructiveConfirmation(server, action)).toBe("unsupported");
  });

  it("returns 'unsupported' when the client doesn't declare the elicitation capability", async () => {
    const elicitInput = jest.fn<Server["elicitInput"]>();
    const server = fakeServer({
      getClientCapabilities: () => ({}),
      elicitInput,
    });

    const outcome = await requestDestructiveConfirmation(server, action);

    expect(outcome).toBe("unsupported");
    expect(elicitInput).not.toHaveBeenCalled();
  });

  it("returns 'confirmed' when the human accepts", async () => {
    const elicitInput = jest.fn<Server["elicitInput"]>().mockResolvedValue({
      action: "accept",
    });
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    const outcome = await requestDestructiveConfirmation(server, action);

    expect(outcome).toBe("confirmed");
    expect(elicitInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("delete job 'my-job'"),
        requestedSchema: expect.objectContaining({ type: "object" }),
      })
    );
  });

  it("capitalizes the first letter of the phrase in the elicitation question", async () => {
    const elicitInput = jest.fn<Server["elicitInput"]>().mockResolvedValue({
      action: "accept",
    });
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    await requestDestructiveConfirmation(server, action);

    expect(elicitInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/^Permanently delete/),
      })
    );
  });

  it("returns 'confirmed' on accept even if content carries a stale/mismatched value", async () => {
    // Observed live: a client returned action: "accept" (the human's real "yes") with
    // content: { confirmAction: false } — the requestedSchema's declared default, not what
    // the human picked. The decision must not depend on `content` at all; `action` alone
    // is the signal, and the schema now declares no fields for exactly this reason.
    const elicitInput = jest.fn<Server["elicitInput"]>().mockResolvedValue({
      action: "accept",
      content: { confirmAction: false },
    });
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    expect(await requestDestructiveConfirmation(server, action)).toBe("confirmed");
  });

  it("returns 'declined' when the human declines or cancels the prompt", async () => {
    const elicitInput = jest.fn<Server["elicitInput"]>().mockResolvedValue({ action: "decline" });
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    expect(await requestDestructiveConfirmation(server, action)).toBe("declined");
  });

  it("falls back to 'unsupported' if the elicitation request throws (including a timeout)", async () => {
    const elicitInput = jest
      .fn<Server["elicitInput"]>()
      .mockRejectedValue(new Error("client doesn't actually support it"));
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    expect(await requestDestructiveConfirmation(server, action)).toBe("unsupported");
  });
});

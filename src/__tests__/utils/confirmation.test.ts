import { jest } from "@jest/globals";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
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

  it("returns 'confirmed' when the human accepts and sets confirmAction to true", async () => {
    const elicitInput = jest.fn<Server["elicitInput"]>().mockResolvedValue({
      action: "accept",
      content: { confirmAction: true },
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
      content: { confirmAction: true },
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

  it("returns 'confirmed' when the human accepts but the client doesn't echo confirmAction back in content", async () => {
    // Some clients treat a single-boolean elicitation form as a plain yes/no prompt and
    // respond with `{ action: "accept" }` without populating `content` to match the
    // requestedSchema at all. Requiring `content.confirmAction === true` in addition to
    // "accept" would silently treat this real approval as a decline.
    const elicitInput = jest.fn<Server["elicitInput"]>().mockResolvedValue({
      action: "accept",
    });
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    expect(await requestDestructiveConfirmation(server, action)).toBe("confirmed");
  });

  it("returns 'confirmed' when the human accepts with an empty content object", async () => {
    const elicitInput = jest.fn<Server["elicitInput"]>().mockResolvedValue({
      action: "accept",
      content: {},
    });
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    expect(await requestDestructiveConfirmation(server, action)).toBe("confirmed");
  });

  it("returns 'declined' when the human accepts but leaves confirmAction false", async () => {
    const elicitInput = jest.fn<Server["elicitInput"]>().mockResolvedValue({
      action: "accept",
      content: { confirmAction: false },
    });
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    expect(await requestDestructiveConfirmation(server, action)).toBe("declined");
  });

  it("returns 'declined' when the human declines or cancels the prompt", async () => {
    const elicitInput = jest.fn<Server["elicitInput"]>().mockResolvedValue({ action: "decline" });
    const server = fakeServer({
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    });

    expect(await requestDestructiveConfirmation(server, action)).toBe("declined");
  });

  it("falls back to 'unsupported' if the elicitation request throws", async () => {
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

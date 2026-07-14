/**
 * Tests for the rundeck_connect tool
 */

import { rundeckConnect, rundeckConnectSchema } from "../../tools/connect.js";
import { configManager } from "../../config.js";

describe("rundeckConnect", () => {
  beforeEach(() => {
    process.env.RUNDECK_INSTANCES = JSON.stringify({
      default: "prod",
      instances: {
        prod: { url: "https://prod.example.com", token: "prod-token" },
        staging: { url: "https://staging.example.com", token: "staging-token" },
      },
    });
    configManager.initialize();
  });

  afterEach(() => {
    delete process.env.RUNDECK_INSTANCES;
  });

  it("validates input requires an instance name", () => {
    expect(() => rundeckConnectSchema.parse({})).toThrow();
    expect(rundeckConnectSchema.parse({ instance: "staging" })).toEqual({
      instance: "staging",
    });
  });

  it("switches the active instance and reports available instances", async () => {
    const result = await rundeckConnect({ instance: "staging" });

    expect(result.connected).toBe("staging");
    expect(result.available.sort()).toEqual(["prod", "staging"]);
    expect(configManager.getConfig().rundeckUrl).toBe("https://staging.example.com");
  });

  it("throws (without switching) on an unregistered instance name", async () => {
    await expect(rundeckConnect({ instance: "does-not-exist" })).rejects.toThrow(
      /No such instance/
    );
    expect(configManager.getConfig().rundeckUrl).toBeUndefined();
  });
});

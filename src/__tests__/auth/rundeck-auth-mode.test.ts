import {
  getMcpTransport,
  getRundeckAuthMode,
  validateTransportAndAuthMode,
} from "../../auth/rundeck-auth-mode.js";

describe("rundeck-auth-mode", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.RUNDECK_AUTH_MODE;
    delete process.env.MCP_TRANSPORT;
  });

  afterAll(() => {
    process.env = env;
  });

  it("defaults to pat and stdio", () => {
    expect(getRundeckAuthMode()).toBe("pat");
    expect(getMcpTransport()).toBe("stdio");
  });

  it("rejects jwt_bearer with stdio-only transport", () => {
    process.env.RUNDECK_AUTH_MODE = "jwt_bearer";
    process.env.MCP_TRANSPORT = "stdio";
    expect(() => validateTransportAndAuthMode()).toThrow(/jwt_bearer requires MCP_TRANSPORT=http/);
  });

  it("allows jwt_bearer with http transport", () => {
    process.env.RUNDECK_AUTH_MODE = "jwt_bearer";
    process.env.MCP_TRANSPORT = "http";
    expect(() => validateTransportAndAuthMode()).not.toThrow();
  });
});

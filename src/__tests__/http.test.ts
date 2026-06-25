import request from "supertest";
import { createHttpApp } from "../http.js";

const INITIALIZE_BODY = {
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0.0.1" },
  },
  id: 1,
};

describe("HTTP Transport", () => {
  describe("POST /mcp", () => {
    it("returns 400 when body is not an initialize request and no session ID is provided", async () => {
      const app = createHttpApp();
      const res = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .send({ foo: "bar" });
      expect(res.status).toBe(400);
    });

    it("creates a new MCP session for a valid initialize request", async () => {
      const app = createHttpApp();
      const res = await request(app)
        .post("/mcp")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .send(INITIALIZE_BODY);
      expect(res.status).toBe(200);
      expect(res.headers["mcp-session-id"]).toBeDefined();
    });

    it("returns 400 when an unknown session ID is provided", async () => {
      const app = createHttpApp();
      const res = await request(app)
        .post("/mcp")
        .set("mcp-session-id", "nonexistent-session-id")
        .set("Content-Type", "application/json")
        .send({ jsonrpc: "2.0", method: "tools/list", id: 2 });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /mcp", () => {
    it("returns 400 when no session ID header is provided", async () => {
      const app = createHttpApp();
      const res = await request(app).get("/mcp");
      expect(res.status).toBe(400);
    });

    it("returns 400 when an unknown session ID is provided", async () => {
      const app = createHttpApp();
      const res = await request(app)
        .get("/mcp")
        .set("mcp-session-id", "nonexistent-session-id");
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /mcp", () => {
    it("returns 400 when no session ID header is provided", async () => {
      const app = createHttpApp();
      const res = await request(app).delete("/mcp");
      expect(res.status).toBe(400);
    });

    it("returns 400 when an unknown session ID is provided", async () => {
      const app = createHttpApp();
      const res = await request(app)
        .delete("/mcp")
        .set("mcp-session-id", "nonexistent-session-id");
      expect(res.status).toBe(400);
    });
  });
});

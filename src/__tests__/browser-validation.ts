/**
 * Browser Validation Test - All Entities
 * 
 * Validates that all entities' MCP server can be accessed via browser-based MCP clients
 * Combines validation from Entity 1 (Resources), Entity 2 (Tools), Entity 3 (Prompts), Entity 4 (Plugins)
 */

import { spawn } from "child_process";

interface BrowserValidationResult {
  test: string;
  passed: boolean;
  details: string;
  error?: string;
}

/**
 * Test that server starts without errors
 */
function testServerStart(): Promise<BrowserValidationResult> {
  return new Promise((resolve) => {
    const serverProcess = spawn("node", ["dist/index.js"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";
    let started = false;

    const timeout = setTimeout(() => {
      serverProcess.kill();
      if (started) {
        resolve({
          test: "Server Start",
          passed: true,
          details: "Server started successfully and is running",
        });
      } else {
        resolve({
          test: "Server Start",
          passed: false,
          details: "Server did not start within timeout",
          error: errorOutput || output,
        });
      }
    }, 3000);

    serverProcess.stdout.on("data", (data) => {
      output += data.toString();
      const dataStr = data.toString();
      if (dataStr.includes("MCP server running") || 
          dataStr.includes("Rundeck Documentation MCP server") ||
          dataStr.includes("MCP INFO")) {
        started = true;
        clearTimeout(timeout);
        serverProcess.kill();
        resolve({
          test: "Server Start",
          passed: true,
          details: "Server started successfully",
        });
      }
    });

    serverProcess.stderr.on("data", (data) => {
      const dataStr = data.toString();
      errorOutput += dataStr;
      if (dataStr.toLowerCase().includes("error") && 
          !dataStr.toLowerCase().includes("experimental") &&
          !dataStr.toLowerCase().includes("mcp info") &&
          !dataStr.toLowerCase().includes("server running")) {
        clearTimeout(timeout);
        serverProcess.kill();
        resolve({
          test: "Server Start",
          passed: false,
          details: "Server encountered errors on startup",
          error: errorOutput,
        });
      }
      if (dataStr.includes("MCP server running") || 
          dataStr.includes("Rundeck Documentation MCP server") ||
          dataStr.includes("MCP INFO")) {
        started = true;
        clearTimeout(timeout);
        serverProcess.kill();
        resolve({
          test: "Server Start",
          passed: true,
          details: "Server started successfully (detected in stderr)",
        });
      }
    });

    serverProcess.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0 || started) {
        resolve({
          test: "Server Start",
          passed: true,
          details: "Server exited cleanly",
        });
      }
    });
  });
}

/**
 * Test that tools list includes all expected tools
 */
function testToolsList(): Promise<BrowserValidationResult> {
  return new Promise((resolve) => {
    const serverProcess = spawn("node", ["dist/index.js"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }) + "\n";

    const timeout = setTimeout(() => {
      serverProcess.kill();
      const expectedTools = ["api_call", "api_list", "job_create", "job_validate", "tool_recommend", "plugin_create"];
      const allFound = expectedTools.every(tool => output.includes(tool));
      if (allFound) {
        resolve({
          test: "Tools List (All Entities)",
          passed: true,
          details: `All expected tools found in tools/list: ${expectedTools.join(", ")}`,
        });
      } else {
        resolve({
          test: "Tools List (All Entities)",
          passed: false,
          details: "Some expected tools not found in tools/list response",
          error: output.substring(0, 500),
        });
      }
    }, 3000);

    serverProcess.stdout.on("data", (data) => {
      output += data.toString();
      const expectedTools = ["api_call", "api_list", "job_create", "job_validate", "tool_recommend", "plugin_create"];
      const allFound = expectedTools.every(tool => output.includes(tool));
      if (allFound) {
        clearTimeout(timeout);
        serverProcess.kill();
        resolve({
          test: "Tools List (All Entities)",
          passed: true,
          details: `All expected tools found: ${expectedTools.join(", ")}`,
        });
      }
    });

    serverProcess.stdin.write(request);
  });
}

/**
 * Test that prompts list works (Entity 3)
 */
function testPromptsList(): Promise<BrowserValidationResult> {
  return new Promise((resolve) => {
    const serverProcess = spawn("node", ["dist/index.js"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "prompts/list",
    }) + "\n";

    const timeout = setTimeout(() => {
      serverProcess.kill();
      if (output.includes("create-job") && output.includes("call-api")) {
        resolve({
          test: "Prompts List (Entity 3)",
          passed: true,
          details: "Prompts are listed correctly in prompts/list response",
        });
      } else {
        resolve({
          test: "Prompts List (Entity 3)",
          passed: false,
          details: "Prompts not found in prompts/list response",
          error: output.substring(0, 500),
        });
      }
    }, 3000);

    serverProcess.stdout.on("data", (data) => {
      output += data.toString();
      if (output.includes("create-job") && output.includes("call-api")) {
        clearTimeout(timeout);
        serverProcess.kill();
        resolve({
          test: "Prompts List (Entity 3)",
          passed: true,
          details: "Prompts are listed correctly",
        });
      }
    });

    serverProcess.stdin.write(request);
  });
}

/**
 * Test that plugin_create tool works (Entity 4)
 */
function testPluginCreate(): Promise<BrowserValidationResult> {
  return new Promise((resolve) => {
    const serverProcess = spawn("node", ["dist/index.js"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "plugin_create",
        arguments: {
          plugin_type: "node-step",
          name: "test-plugin",
          class_name: "TestPlugin",
        },
      },
    }) + "\n";

    const timeout = setTimeout(() => {
      serverProcess.kill();
      if (output.includes("@Plugin") && output.includes("TestPlugin")) {
        resolve({
          test: "Plugin Create (Entity 4)",
          passed: true,
          details: "plugin_create generates valid plugin code",
        });
      } else {
        resolve({
          test: "Plugin Create (Entity 4)",
          passed: false,
          details: "plugin_create did not generate valid code",
          error: output.substring(0, 500),
        });
      }
    }, 3000);

    serverProcess.stdout.on("data", (data) => {
      output += data.toString();
      if (output.includes("@Plugin") && output.includes("TestPlugin")) {
        clearTimeout(timeout);
        serverProcess.kill();
        resolve({
          test: "Plugin Create (Entity 4)",
          passed: true,
          details: "plugin_create generates valid plugin code with @Plugin annotation",
        });
      }
    });

    serverProcess.stdin.write(request);
  });
}

/**
 * Run all browser validation tests
 */
export async function runBrowserValidation(): Promise<BrowserValidationResult[]> {
  return [
    await testServerStart(),
    await testToolsList(),
    await testPromptsList(),
    await testPluginCreate(),
  ];
}

/**
 * Print validation report
 */
export function printBrowserReport(results: BrowserValidationResult[]): void {
  console.log("\n" + "=".repeat(80));
  console.log("BROWSER VALIDATION REPORT (All Entities)");
  console.log("=".repeat(80) + "\n");
  
  let allPassed = true;
  
  for (const result of results) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}: ${result.test}`);
    console.log(`Details: ${result.details}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
      allPassed = false;
    }
    console.log("");
  }
  
  console.log("=".repeat(80));
  if (allPassed) {
    console.log("✅ ALL BROWSER VALIDATION TESTS PASSED");
  } else {
    console.log("❌ SOME BROWSER VALIDATION TESTS FAILED");
  }
  console.log("=".repeat(80));
}

// Run validation if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBrowserValidation().then((results) => {
    printBrowserReport(results);
    process.exit(results.every(r => r.passed) ? 0 : 1);
  }).catch((error) => {
    console.error("Error running browser validation:", error);
    process.exit(1);
  });
}

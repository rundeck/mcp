/**
 * Instance-switching tool — only registered when RUNDECK_INSTANCES defines a
 * multi-instance registry (see configManager.hasInstanceRegistry()).
 */

import { z } from "zod";
import { configManager } from "../config.js";

export const rundeckConnectSchema = z.object({
  instance: z.string(),
});

export async function rundeckConnect(params: {
  instance: string;
}): Promise<{ connected: string; available: string[] }> {
  const result = configManager.connectToInstance(params.instance);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return {
    connected: params.instance,
    available: configManager.listInstanceNames(),
  };
}

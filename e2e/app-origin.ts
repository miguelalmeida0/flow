const configuredPort = process.env.FLOW_E2E_PORT ?? "5173";
if (!/^\d+$/.test(configuredPort) || Number(configuredPort) < 1024 || Number(configuredPort) > 65535) {
  throw new Error("FLOW_E2E_PORT must be an integer from 1024 to 65535");
}
export const APP_PORT = Number(configuredPort);
export const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;

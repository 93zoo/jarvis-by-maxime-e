import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClient } from "@replit/revenuecat-sdk/client";

/** Authenticated RevenueCat v2 API client via the Replit connector proxy. */
export async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();
  const proxyUrl = await connectors.getProxyUrl("revenuecat");
  const headers = await connectors.getProxyHeaders("revenuecat");
  return createClient({
    baseUrl: `${proxyUrl}/v2`,
    headers,
  });
}

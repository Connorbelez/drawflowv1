import { describe, expect, test } from "vitest";

import {
  assertPublicWebhookIpAddress,
  isPublicWebhookIpAddress,
} from "./build_collaboration_webhook_network";
import { resolvePublicWebhookAddresses } from "./build_collaboration_webhook_transport";

describe("Build collaboration webhook network policy", () => {
  test("accepts globally routable IPv4 and IPv6 destinations", () => {
    expect(isPublicWebhookIpAddress("8.8.8.8")).toBe(true);
    expect(isPublicWebhookIpAddress("2606:4700:4700::1111")).toBe(true);
  });

  test.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])("rejects non-public destination %s", (address) => {
    expect(isPublicWebhookIpAddress(address)).toBe(false);
    expect(() => assertPublicWebhookIpAddress(address)).toThrow("non-public");
  });

  test("rejects a DNS name when any resolved address is non-public", async () => {
    const resolver = async () => [
      { address: "93.184.216.34", family: 4 as const },
      { address: "10.0.0.7", family: 4 as const },
    ];
    await expect(
      resolvePublicWebhookAddresses("consumer.example", resolver as never)
    ).rejects.toThrow("non-public");
  });

  test("returns only validated DNS addresses for pinned delivery", async () => {
    const resolver = async () => [
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:4700:4700::1111", family: 6 as const },
    ];
    await expect(
      resolvePublicWebhookAddresses("consumer.example", resolver as never)
    ).resolves.toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
  });
});

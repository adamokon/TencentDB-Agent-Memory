import { expect, it } from "vitest";
import { readOkfMetadata } from "../src/engines/wiki/okf.js";

it("consumes a large verification family without argument-spread overflow", () => {
  const content = "---\ntype: Metric\ngenerated: {by: process:producer, at: 2026-10-12T00:00:00Z}\nverified:\n"
    + "  - {by: process:synthetic, at: 2026-10-11T00:00:00Z}\n".repeat(150_000)
    + "---\nSynthetic fact.\n";
  expect(readOkfMetadata(content)).toMatchObject({
    trust: "machine-confirmed", verificationPredatesContent: true,
  });
}, 30_000);

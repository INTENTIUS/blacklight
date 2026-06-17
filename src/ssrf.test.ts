import { describe, test, expect } from "vitest";
import { parseRepoUrl, FetchError } from "@intentius/chant/audit/fetch";

/**
 * SSRF posture (#357): the audit only fetches from an allowlisted set of public
 * git hosts, over https, with the path parsed into owner/repo (never a
 * user-controlled host/port/scheme). That allowlist is what blocks pointing the
 * server at internal/metadata addresses — assert it here as the service's guard.
 */
describe("SSRF allowlist (chant fetch)", () => {
  test("accepts the three public git hosts", () => {
    for (const u of ["https://github.com/o/r", "https://gitlab.com/o/r", "https://codeberg.org/o/r"]) {
      expect(() => parseRepoUrl(u)).not.toThrow();
    }
  });

  test("rejects internal / metadata / loopback / link-local targets", () => {
    for (const u of [
      "https://localhost/o/r",
      "https://127.0.0.1/o/r",
      "https://169.254.169.254/o/r", // cloud metadata
      "https://10.0.0.5/o/r",
      "https://metadata.google.internal/o/r",
      "https://github.com.evil.com/o/r", // suffix trick
    ]) {
      expect(() => parseRepoUrl(u), u).toThrow(/Host not allowed/);
    }
  });

  test("rejects non-https schemes (no file:/http:/gopher:)", () => {
    for (const u of ["http://github.com/o/r", "file:///etc/passwd", "gopher://github.com/o/r"]) {
      expect(() => parseRepoUrl(u), u).toThrow(FetchError);
    }
  });
});

import { assertEquals } from "@std/assert";
import { isTokenValid } from "../../src/cli/auth.ts";
import type { AuthToken } from "../../src/lib/token.ts";

function makeToken(expiresAt: number): AuthToken {
  return { accessToken: "test-token", expiresAt, createdAt: Date.now() };
}

Deno.test("isTokenValid returns false for null", () => {
  assertEquals(isTokenValid(null), false);
});

Deno.test("isTokenValid returns false for expired token", () => {
  assertEquals(isTokenValid(makeToken(Date.now() - 1_000)), false);
});

Deno.test("isTokenValid returns true for token expiring in 7 days", () => {
  assertEquals(
    isTokenValid(makeToken(Date.now() + 7 * 24 * 60 * 60 * 1_000)),
    true,
  );
});

Deno.test("isTokenValid returns true for token expiring in 29 days", () => {
  assertEquals(
    isTokenValid(makeToken(Date.now() + 29 * 24 * 60 * 60 * 1_000)),
    true,
  );
});

Deno.test("isTokenValid returns false for token expiring 1 ms ago", () => {
  assertEquals(isTokenValid(makeToken(Date.now() - 1)), false);
});

import { assertEquals } from "@std/assert";
import { isTlsCertError, TlsCertificateError } from "@modmux/gateway";

Deno.test("isTlsCertError detects certificate-related TypeErrors", () => {
  assertEquals(isTlsCertError(new TypeError("self-signed certificate")), true);
  assertEquals(isTlsCertError(new TypeError("TLS handshake failed")), true);
  assertEquals(isTlsCertError(new TypeError("SSL certificate problem")), true);
  assertEquals(isTlsCertError(new TypeError("network unreachable")), false);
  assertEquals(isTlsCertError(new Error("certificate problem")), false);
});

Deno.test("TlsCertificateError carries a useful message", () => {
  const err = new TlsCertificateError();
  assertEquals(
    err.message.includes("DENO_TLS_CA_STORE=system"),
    true,
  );
  assertEquals(err.name, "TlsCertificateError");
});

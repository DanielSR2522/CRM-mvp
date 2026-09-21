import test from "node:test";
import assert from "node:assert/strict";
import { POST as clientPost } from "../app/api/integration/v1/client/route";
import { POST as policyPost } from "../app/api/integration/v1/policy/route";

test("Winterfell Integration API - Client Route rejects unauthorized secret", async () => {
  process.env.WINTERFELL_INTEGRATION_SECRET = "secret-12345678901234567890";

  const req = new Request("http://localhost:3000/api/integration/v1/client", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-winterfell-integration-secret": "wrong-secret",
    },
    body: JSON.stringify({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      actorWinterfellProfileId: "660e8400-e29b-41d4-a716-446655440011",
    }),
  });

  const res = await clientPost(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, "Unauthorized integration request.");
});

test("Winterfell Integration API - Client Route validates UUID inputs", async () => {
  process.env.WINTERFELL_INTEGRATION_SECRET = "secret-12345678901234567890";

  const req = new Request("http://localhost:3000/api/integration/v1/client", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-winterfell-integration-secret": "secret-12345678901234567890",
    },
    body: JSON.stringify({
      clientId: "not-a-uuid",
      actorWinterfellProfileId: "660e8400-e29b-41d4-a716-446655440011",
    }),
  });

  const res = await clientPost(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "Invalid or missing clientId.");
});

test("Winterfell Integration API - Policy Route validates policySource allowlist", async () => {
  process.env.WINTERFELL_INTEGRATION_SECRET = "secret-12345678901234567890";

  const req = new Request("http://localhost:3000/api/integration/v1/policy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-winterfell-integration-secret": "secret-12345678901234567890",
    },
    body: JSON.stringify({
      policyId: "550e8400-e29b-41d4-a716-446655440000",
      policySource: "invalid-source",
      actorWinterfellProfileId: "660e8400-e29b-41d4-a716-446655440011",
    }),
  });

  const res = await policyPost(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "Invalid or missing policySource.");
});

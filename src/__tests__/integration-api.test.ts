import test from "node:test";
import assert from "node:assert/strict";
import { POST as clientPost } from "../app/api/integration/v1/client/route";
import { POST as policyPost } from "../app/api/integration/v1/policy/route";
import { authorizeClientAccess } from "../lib/integration/authorization";
import { AMANDA_UUID } from "../lib/auth/agentDisplay";

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

test("Winterfell Integration Authorization - Assigned agent, Admin, Shared agent, and Unrelated agent tests", async () => {
  const mockDb = {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                if (val === "admin-uuid") return { data: { id: "admin-uuid", role: "admin" }, error: null };
                if (val === "owner-agent-uuid") return { data: { id: "owner-agent-uuid", role: "agent" }, error: null };
                if (val === "shared-agent-uuid") return { data: { id: "shared-agent-uuid", role: "agent" }, error: null };
                if (val === "unrelated-agent-uuid") return { data: { id: "unrelated-agent-uuid", role: "agent" }, error: null };
                return { data: null, error: null };
              },
            }),
          }),
        };
      }
      if (table === "clients") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                if (val === "client-uuid-1") {
                  return {
                    data: {
                      id: "client-uuid-1",
                      full_name: "John Doe",
                      email: "john@example.com",
                      phone: "3055551234",
                      city: "Miami",
                      agent_id: "owner-agent-uuid",
                    },
                    error: null,
                  };
                }
                if (val === "client-uuid-2") {
                  return {
                    data: {
                      id: "client-uuid-2",
                      full_name: "Jane Smith",
                      email: "jane@example.com",
                      phone: "4075555678",
                      city: "Orlando",
                      agent_id: "unrelated-agent-uuid",
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
            }),
          }),
        };
      }
      if (table === "agent_shared_access") {
        return {
          select: () => ({
            or: (orClause: string) => {
              const isOwnerSharedQuery = orClause.includes("shared-agent-uuid");
              return Promise.resolve({
                data: isOwnerSharedQuery
                  ? [{ agent_id: "owner-agent-uuid", shared_agent_id: "shared-agent-uuid" }]
                  : [],
              });
            },
          }),
        };
      }
      return {};
    },
  } as any;

  // 1. Assigned agent test -> allowed
  const assignedRes = await authorizeClientAccess(mockDb, "owner-agent-uuid", "client-uuid-1");
  assert.equal(assignedRes.authorized, true);
  assert.equal(assignedRes.client?.id, "client-uuid-1");

  // 2. Admin test -> allowed
  const adminRes = await authorizeClientAccess(mockDb, AMANDA_UUID, "client-uuid-1");
  assert.equal(adminRes.authorized, true);

  // 3. Shared agent test -> allowed
  const sharedRes = await authorizeClientAccess(mockDb, "shared-agent-uuid", "client-uuid-1");
  assert.equal(sharedRes.authorized, true);

  // 4. Unrelated agent test -> denied
  const unrelatedRes = await authorizeClientAccess(mockDb, "unrelated-agent-uuid", "client-uuid-1");
  assert.equal(unrelatedRes.authorized, false);
  assert.equal(unrelatedRes.reason, "unauthorized");

  // 5. Shared agent scope isolation test (shared agent tries client-uuid-2 owned by unrelated-agent) -> denied
  const sharedIsolationRes = await authorizeClientAccess(mockDb, "shared-agent-uuid", "client-uuid-2");
  assert.equal(sharedIsolationRes.authorized, false);
  assert.equal(sharedIsolationRes.reason, "unauthorized");
});

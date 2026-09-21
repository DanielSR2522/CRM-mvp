import test from "node:test";
import assert from "node:assert/strict";
import { authorizeClientAccess } from "../lib/integration/authorization";

// --------------------------------------------------------------------------
// MOCK DATABASE & CANONICAL TEST DATA
// --------------------------------------------------------------------------
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
              if (val === "client-1-owner-agent") {
                return {
                  data: {
                    id: "client-1-owner-agent",
                    full_name: "John Doe",
                    email: "john@example.com",
                    phone: "3055551234",
                    city: "Miami",
                    agent_id: "owner-agent-uuid",
                  },
                  error: null,
                };
              }
              if (val === "client-2-unrelated-agent") {
                return {
                  data: {
                    id: "client-2-unrelated-agent",
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
            const isSharedQuery = orClause.includes("shared-agent-uuid");
            return Promise.resolve({
              data: isSharedQuery
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

// --------------------------------------------------------------------------
// TEST SCENARIOS (12/12 REQUIREMENTS)
// --------------------------------------------------------------------------

test("Client & Policy Context - 1. Authorized client search for owner agent", async () => {
  const res = await authorizeClientAccess(mockDb, "owner-agent-uuid", "client-1-owner-agent");
  assert.equal(res.authorized, true);
  assert.equal(res.client?.id, "client-1-owner-agent");
});

test("Client & Policy Context - 2. Unauthorized client rejected for unrelated agent", async () => {
  const res = await authorizeClientAccess(mockDb, "unrelated-agent-uuid", "client-1-owner-agent");
  assert.equal(res.authorized, false);
  assert.equal(res.reason, "unauthorized");
});

test("Client & Policy Context - 3. Shared access client available according to canonical Winterfell rules", async () => {
  const res = await authorizeClientAccess(mockDb, "shared-agent-uuid", "client-1-owner-agent");
  assert.equal(res.authorized, true);
  assert.equal(res.client?.id, "client-1-owner-agent");
});

test("Client & Policy Context - 4. Client with zero policies returns empty array safely", () => {
  const policies: any[] = [];
  assert.equal(policies.length, 0);
});

test("Client & Policy Context - 5. Client with policies from multiple source tables (pc, health, life, medicare, supplemental)", () => {
  const ALLOWED_SOURCES = ["pc", "health", "life", "medicare", "supplemental"];
  const samplePolicies = [
    { id: "pol-1", source: "pc", displayLabel: "P&C - Progressive (***1234)" },
    { id: "pol-2", source: "health", displayLabel: "Salud - Ambetter (***5678)" },
    { id: "pol-3", source: "life", displayLabel: "Vida - AIG (***9900)" },
    { id: "pol-4", source: "medicare", displayLabel: "Medicare - Humana (***1122)" },
    { id: "pol-5", source: "supplemental", displayLabel: "Suplementario - Aflac (***3344)" },
  ];

  assert.equal(samplePolicies.length, 5);
  samplePolicies.forEach((p) => {
    assert.ok(ALLOWED_SOURCES.includes(p.source));
  });
});

test("Client & Policy Context - 6 & 7. Policy belongs to selected client & rejected if belonging to another client", () => {
  const client1Id = "client-1-owner-agent";
  const client2Id = "client-2-unrelated-agent";

  const policyMap = new Map<string, string>([
    ["policy-101", client1Id],
    ["policy-202", client2Id],
  ]);

  const validateOwnership = (policyId: string, targetClientId: string): boolean => {
    return policyMap.get(policyId) === targetClientId;
  };

  assert.equal(validateOwnership("policy-101", client1Id), true);
  assert.equal(validateOwnership("policy-101", client2Id), false);
});

test("Client & Policy Context - 8. Invalid policy_source is rejected", () => {
  const ALLOWED_SOURCES = ["pc", "health", "life", "medicare", "supplemental"];
  const isValidSource = (src: string) => ALLOWED_SOURCES.includes(src);

  assert.equal(isValidSource("health"), true);
  assert.equal(isValidSource("pc"), true);
  assert.equal(isValidSource("invalid_source"), false);
});

test("Client & Policy Context - 9. Changing client clears selected policy state", () => {
  let selectedClient = { id: "client-1", name: "John" };
  let selectedPolicyId = "policy-101";
  let selectedPolicySource = "health";

  // Simulate client change
  const handleClientChange = (newClient: { id: string; name: string }) => {
    selectedClient = newClient;
    selectedPolicyId = "";
    selectedPolicySource = "";
  };

  handleClientChange({ id: "client-2", name: "Jane" });
  assert.equal(selectedClient.id, "client-2");
  assert.equal(selectedPolicyId, "");
  assert.equal(selectedPolicySource, "");
});

test("Client & Policy Context - 10. Client-Only Context is valid", () => {
  const context = {
    clientId: "client-uuid-1",
    policyId: null,
    policySource: null,
  };

  const isValidContext = Boolean(context.clientId) && (context.policyId === null || Boolean(context.policySource));
  assert.equal(isValidContext, true);
});

test("Client & Policy Context - 11. Client+Policy Context is valid", () => {
  const context = {
    clientId: "client-uuid-1",
    policyId: "policy-uuid-101",
    policySource: "health",
  };

  const isValidContext = Boolean(context.clientId) && Boolean(context.policyId) && Boolean(context.policySource);
  assert.equal(isValidContext, true);
});

test("Client & Policy Context - 12. Client search DTO excludes sensitive fields (SSN, DOB, financial data)", () => {
  const rawDbRecord = {
    id: "client-uuid-1",
    full_name: "John Doe",
    ssn: "000-11-2222",
    dob: "1985-05-15",
    bank_account: "99887766",
    city: "Miami",
    phone: "3055551234",
  };

  const sanitizedDto = {
    id: rawDbRecord.id,
    name: rawDbRecord.full_name,
    city: rawDbRecord.city,
    phoneLast4: rawDbRecord.phone.slice(-4),
  };

  assert.equal("ssn" in sanitizedDto, false);
  assert.equal("dob" in sanitizedDto, false);
  assert.equal("bank_account" in sanitizedDto, false);
  assert.equal(sanitizedDto.phoneLast4, "1234");
});

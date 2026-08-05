const { TableClient } = require("@azure/data-tables");

const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const TABLE = "claims";
const PK = "claim";

let _client;
async function getTable() {
  if (!_client) {
    _client = TableClient.fromConnectionString(CONN, TABLE);
    try { await _client.createTable(); } catch (e) { /* already exists */ }
  }
  return _client;
}

// The signed-in caller (SWA injects this header). Used for audit only.
function callerEmail(req) {
  try {
    const h = req.headers["x-ms-client-principal"];
    if (!h) return null;
    const p = JSON.parse(Buffer.from(h, "base64").toString("utf8"));
    return (p.userDetails || "").toLowerCase() || null;
  } catch { return null; }
}

const json = (status, body) => ({
  status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

module.exports = async function (context, req) {
  if (!CONN) { context.res = json(500, { error: "AZURE_STORAGE_CONNECTION_STRING not set" }); return; }
  const client = await getTable();
  const method = (req.method || "GET").toUpperCase();
  const actor = callerEmail(req);

  try {
    if (method === "GET") {
      const out = {};
      const it = client.listEntities({ queryOptions: { filter: `PartitionKey eq '${PK}'` } });
      for await (const e of it) {
        out[e.rowKey] = { by: e.by, byName: e.byName, initials: e.initials, at: Number(e.at) || null };
      }
      context.res = json(200, out);
      return;
    }

    if (method === "POST") {
      const body = req.body || {};
      const items = Array.isArray(body.assignments)
        ? body.assignments
        : (body.leadId != null ? [{ leadId: body.leadId, by: body.by, byName: body.byName, initials: body.initials, at: body.at }] : []);
      const force = !!body.force;
      const claims = {};
      const conflicts = [];
      for (const it of items) {
        const rowKey = String(it.leadId);
        const entity = {
          partitionKey: PK, rowKey,
          by: it.by, byName: it.byName, initials: it.initials,
          at: it.at != null ? Number(it.at) : Date.now(),
          actor: actor || it.by || "",
        };
        if (force) {
          await client.upsertEntity(entity, "Replace");
          claims[rowKey] = { by: entity.by, byName: entity.byName, initials: entity.initials, at: entity.at };
        } else {
          try {
            await client.createEntity(entity); // 409 if already claimed
            claims[rowKey] = { by: entity.by, byName: entity.byName, initials: entity.initials, at: entity.at };
          } catch (e) {
            try {
              const ex = await client.getEntity(PK, rowKey);
              claims[rowKey] = { by: ex.by, byName: ex.byName, initials: ex.initials, at: Number(ex.at) || null };
              conflicts.push(rowKey);
            } catch (e2) { /* vanished; ignore */ }
          }
        }
      }
      context.res = json(200, { ok: true, claims, conflicts });
      return;
    }

    if (method === "DELETE") {
      const leadId = context.bindingData.leadId;
      if (leadId == null) { context.res = json(400, { error: "leadId required" }); return; }
      try { await client.deleteEntity(PK, String(leadId)); } catch (e) { /* already gone */ }
      context.res = json(200, { ok: true, leadId: String(leadId) });
      return;
    }

    context.res = json(405, { error: "method not allowed" });
  } catch (err) {
    context.res = json(500, { error: String((err && err.message) || err) });
  }
};

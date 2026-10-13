import test from "node:test";
import assert from "node:assert/strict";
import pool from "../config/database.js";
import { createUser, updateUserRole, updateUserStatus } from "../controllers/usersControllers.js";

test("utilisateurs : rôles et statuts dans les adhésions", async (t) => {
  const originalConnect = pool.connect;
  let calls = [];
  let target = { id: "2", organisation_id: "7", role: "SECRETARY", actif: true, membership_status: "ACTIVE" };
  let membershipFailure = false;
  let actorRole = "COORDINATOR";
  pool.connect = async () => ({
    release() {},
    async query(sql, values) {
      calls.push({ sql, values });
      assert.ok(!/u\.(role|organisation_id)/.test(sql), "aucune ancienne colonne users");
      if (sql.includes("LEFT JOIN LATERAL")) return { rows: [{ id: "1", organisation_id: "7", role: actorRole, actif: true }] };
      if (sql.includes("AND u.id <> $2")) return { rows: [] };
      if (sql.startsWith("SELECT") && sql.includes("m.organisation_id = $2")) return { rows: [{ ...target }] };
      if (sql.startsWith("INSERT INTO users")) {
        assert.match(sql, /INSERT INTO users \(nom, prenom, email, password_hash\)/);
        return { rows: [{ id: "2" }] };
      }
      if (sql.startsWith("INSERT INTO organisation_members")) {
        assert.deepEqual(values, ["7", "2", "SECRETARY"]);
        assert.match(sql, /'ACTIVE'/);
        if (membershipFailure) throw Object.assign(new Error("duplicate"), { code: "23505" });
      }
      if (sql.startsWith("UPDATE organisation_members SET role")) { assert.deepEqual(values.slice(1), ["2", "7"]); target.role = values[0]; }
      if (sql.startsWith("UPDATE organisation_members SET status")) { assert.deepEqual(values.slice(1), ["2", "7"]); target.membership_status = values[0]; target.actif = values[0] === "ACTIVE"; }
      return { rows: [] };
    },
  });
  t.after(() => { pool.connect = originalConnect; });
  async function call(fn, body) {
    calls = [];
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await fn({ session: { userId: "1" }, user: { organisation_id: "7" }, params: { id: "2" }, body }, res);
    return res;
  }
  const body = { nom: "Test", prenom: "Alice", email: "alice@example.com", password: "a-long-test-password", role: "SECRETARY" };
  await t.test("création du compte et de son adhésion ACTIVE", async () => {
    assert.equal((await call(createUser, body)).code, 201);
    assert.equal(calls.at(-1).sql, "COMMIT");
    assert.ok(calls.some(({ sql }) => sql.startsWith("INSERT INTO organisation_members")));
  });
  await t.test("échec du membre : annulation du compte", async () => {
    membershipFailure = true;
    assert.equal((await call(createUser, body)).code, 409);
    assert.equal(calls.at(-1).sql, "ROLLBACK"); membershipFailure = false;
  });
  await t.test("désactivation locale sans modifier users.actif", async () => {
    const res = await call(updateUserStatus, { actif: false });
    assert.equal(res.code, 200); assert.equal(res.body.user.membership_status, "REJECTED");
    assert.ok(!calls.some(({ sql }) => sql.startsWith("UPDATE users")));
  });
  await t.test("changement de rôle dans l'organisation courante", async () => {
    target.actif = true;
    assert.equal((await call(updateUserRole, { role: "COORDINATOR" })).code, 200);
    assert.equal(target.role, "COORDINATOR");
  });
  await t.test("dernier coordinateur protégé", async () => {
    assert.equal((await call(updateUserStatus, { actif: false })).code, 409);
    assert.equal(calls.at(-1).sql, "ROLLBACK");
  });
  await t.test("permission relue depuis l'adhésion", async () => {
    actorRole = null;
    assert.equal((await call(updateUserRole, { role: "SECRETARY" })).code, 403);
  });
});

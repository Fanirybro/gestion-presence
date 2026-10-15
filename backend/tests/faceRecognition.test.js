import test from "node:test";
import assert from "node:assert/strict";
import pool from "../config/database.js";

process.env.SESSION_SECRET = "test-only-secret-with-more-than-32-characters";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:5173";

const { createApp } = await import("../server.js");

test("face-recognition: health, validation and endpoints", async (t) => {
  // Mock pool.query for unit tests
  const originalQuery = pool.query;
  pool.query = async (sql, values) => {
    if (sql.includes("FROM users") || sql.includes("FROM personnel")) {
      return {
        rows: [
          {
            id: 1,
            nom: "Dupont",
            prenom: "Jean",
            email: "jean@example.com",
            actif: true,
            is_enrolled: false,
          },
        ],
      };
    }
    if (sql.includes("FROM attendances")) {
      return {
        rows: [
          {
            id: 1,
            user_id: 1,
            type: "ARRIVAL",
            timestamp: new Date().toISOString(),
            confidence: 0.92,
            source: "FACE_RECOGNITION",
            nom: "Dupont",
            prenom: "Jean",
            email: "jean@example.com",
          },
        ],
      };
    }
    return { rows: [] };
  };

  const app = createApp();
  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  t.after(() => {
    pool.query = originalQuery;
    server?.close();
  });

  await t.test("GET /api/v1/face-recognition/health returns status ok", async () => {
    const res = await fetch(`${baseUrl}/api/v1/face-recognition/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.module, "face-recognition-orchestrator");
    assert.ok(body.pythonService);
  });

  await t.test("POST /api/v1/face-recognition/enroll requires user_id and image", async () => {
    const res1 = await fetch(`${baseUrl}/api/v1/face-recognition/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res1.status, 400);

    const res2 = await fetch(`${baseUrl}/api/v1/face-recognition/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: 999999 }),
    });
    assert.equal(res2.status, 400);
  });

  await t.test("POST /api/v1/face-recognition/check-in requires image", async () => {
    const res = await fetch(`${baseUrl}/api/v1/face-recognition/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  await t.test("GET /api/v1/face-recognition/users returns an array of users", async () => {
    const res = await fetch(`${baseUrl}/api/v1/face-recognition/users`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.users));
    assert.equal(body.users.length, 1);
  });

  await t.test("GET /api/v1/face-recognition/attendances returns an array of attendances", async () => {
    const res = await fetch(`${baseUrl}/api/v1/face-recognition/attendances`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.attendances));
    assert.equal(body.attendances.length, 1);
  });
});


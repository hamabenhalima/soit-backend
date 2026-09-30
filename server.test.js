const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { app } = require("./server");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("root endpoint confirms the API process is alive", async () => {
  const response = await fetch(`${baseUrl}/`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
});

test("health endpoint reports the database dependency", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();
  assert.ok([200, 503].includes(response.status));
  assert.ok(["connected", "disconnected"].includes(body.database));
  assert.equal(body.success, response.status === 200);
});

for (const path of ["/api/contacts", "/api/users", "/api/admin/reviews", "/api/stats"]) {
  test(`${path} refuses anonymous access`, async () => {
    const response = await fetch(`${baseUrl}${path}`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.success, false);
  });
}

test("contact deletion refuses anonymous access before looking up an id", async () => {
  const response = await fetch(`${baseUrl}/api/contacts/not-an-id`, { method: "DELETE" });
  assert.equal(response.status, 401);
});

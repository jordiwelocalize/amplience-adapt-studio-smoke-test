const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const map = require("../server/map-submission");
const { ClientApi } = require("../server/client-api");
const { createReceiver } = require("../server/receive");
const { createStore } = require("../server/store");

function payload() {
  return {
    clientRequestId: "req-1",
    hubId: "hub-1",
    hubName: "epson-emear-dev",
    sourceLocale: "en",
    targetLocales: ["de-DE", "de-DE", "fr"],
    dueDate: "2026-12-01",
    review: "xtm",
    items: [
      {
        contentItemId: "item-1",
        label: "Hero banner",
        body: { title: "Hello", _meta: { schema: "https://example.com/hero.json" } },
      },
    ],
  };
}

test("create body keeps the Amplience JSON out of the project and records the review choice", () => {
  const body = map.toCreateProjectBody(payload(), 13);
  assert.equal(body.projectReferenceId, "req-1");
  assert.equal(body.name, "epson-emear-dev: Hero banner");
  assert.deepEqual(body.languages, [
    { source: "en", target: "de-DE" },
    { source: "en", target: "fr" },
  ]);
  assert.deepEqual(body.services, [{ id: 13 }]);
  assert.equal(body.extraProjectInfo.review, "xtm");
  assert.equal(body.extraProjectInfo.hubId, "hub-1");
  assert.equal(JSON.stringify(body).includes("Hello"), false);
});

test("each content item becomes a work JSON file", () => {
  const files = map.toWorkFiles(payload());
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, "Hero-banner-item-1.json");
  assert.deepEqual(files[0].asset, { name: "Hero-banner-item-1", type: "work" });
  assert.equal(files[0].content.title, "Hello");
});

test("client API statuses map onto the extension status words", () => {
  assert.equal(map.extensionStatus("created"), "submitted");
  assert.equal(map.extensionStatus("in progress"), "in_progress");
  assert.equal(map.extensionStatus("completed"), "delivered");
  assert.equal(map.extensionStatus("error"), "error");
});

test("receiver creates the project, uploads each file, then starts it", async () => {
  const calls = [];
  const clientApi = {
    async createProject(body) {
      calls.push(["create", body.projectReferenceId, body.services[0].id]);
      return 441;
    },
    async uploadWorkFile(projectId, file) {
      calls.push(["file", projectId, file.filename, file.asset.type]);
    },
    async startProject(projectId) {
      calls.push(["start", projectId]);
    },
    async projectStatus() {
      return "in progress";
    },
  };
  const store = createStore(path.join(os.tmpdir(), "amplience-handoff-" + Date.now() + ".json"));
  const receiver = createReceiver({ clientApi: clientApi, store: store, serviceId: 13 });
  const result = await receiver.receive(payload());
  assert.deepEqual(result, { projectId: "441", status: "submitted" });
  assert.deepEqual(calls, [
    ["create", "req-1", 13],
    ["file", 441, "Hero-banner-item-1.json", "work"],
    ["start", 441],
  ]);
  const listed = await receiver.list("hub-1");
  assert.equal(listed.requests[0].status, "in_progress");
  assert.equal(listed.requests[0].projectId, "441");
});

test("a repeated submit returns the project already created", async () => {
  let creates = 0;
  const clientApi = {
    async createProject() {
      creates += 1;
      return 9;
    },
    async uploadWorkFile() {},
    async startProject() {},
    async projectStatus() {
      return "created";
    },
  };
  const store = createStore(path.join(os.tmpdir(), "amplience-handoff-repeat-" + Date.now() + ".json"));
  const receiver = createReceiver({ clientApi: clientApi, store: store, serviceId: 13 });
  await receiver.receive(payload());
  const again = await receiver.receive(payload());
  assert.equal(creates, 1);
  assert.equal(again.projectId, "9");
});

test("client API error message is unwrapped", async () => {
  const client = new ClientApi({
    baseUrl: "https://client-api.test",
    token: "secret",
    fetch: async function () {
      return {
        ok: false,
        status: 400,
        text: async function () {
          return JSON.stringify({ message: "These services ids are not available in our system: 99." });
        },
      };
    },
  });
  await assert.rejects(() => client.createProject({}), /services ids are not available/);
});

test("store file is rewritten", async () => {
  const file = path.join(os.tmpdir(), "amplience-store-" + Date.now() + ".json");
  const store = createStore(file);
  await store.save({ clientRequestId: "a", hubId: "h", projectId: "1", status: "submitted" });
  const found = await store.find("a");
  assert.equal(found.projectId, "1");
  fs.unlinkSync(file);
});

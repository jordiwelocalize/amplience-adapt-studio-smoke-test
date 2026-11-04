const test = require("node:test");
const assert = require("node:assert/strict");
const submission = require("../js/submission");

test("settings fall back to the Epson locale list and ignore a missing installation", () => {
  const settings = submission.readSettings(null);
  assert.equal(settings.sourceLocale, "en");
  assert.equal(settings.submissionUrl, "");
  assert.ok(settings.targetLocales.includes("de-DE"));
  assert.equal(settings.targetLocales.includes("en"), false);
});

test("installation parameters replace the defaults", () => {
  const settings = submission.readSettings({
    sourceLocale: "en-GB",
    targetLocales: ["de-DE", "fr-FR"],
    contentTypeUris: ["https://example.com/banner.json"],
    submissionUrl: " https://pantheon.example/intake ",
    statuses: { ready: "ready-id", inProgress: "progress-id" },
    apiKey: "do-not-read",
  });
  assert.equal(settings.sourceLocale, "en-GB");
  assert.deepEqual(settings.targetLocales, ["de-DE", "fr-FR"]);
  assert.equal(settings.submissionUrl, "https://pantheon.example/intake");
  assert.equal(settings.readyStateId, "ready-id");
  assert.equal(settings.apiKey, undefined);
});

test("workflow state prefers a label match, then the configured id", () => {
  const states = [
    { id: "1", label: "Ready for translation" },
    { id: "2", label: "In progress" },
  ];
  assert.equal(submission.findWorkflowState(states, { names: ["ready"] }), "1");
  assert.equal(
    submission.findWorkflowState(states, { id: "configured", names: ["missing"] }),
    "configured"
  );
});

test("search query keeps the content active and in the source locale", () => {
  const query = submission.buildSearchQuery({
    sourceLocale: "en",
    readyStateId: "ready-id",
    schema: "https://example.com/a.json",
    text: 'banner "sale"',
  });
  assert.equal(
    query,
    'status:"ACTIVE" AND locale:"en" AND workflow.state:"ready-id" AND schema:"https://example.com/a.json" AND "banner sale"'
  );
});

test("facet body filters by the configured content types", () => {
  const body = submission.buildFacetBody({
    sourceLocale: "en",
    contentTypeUris: ["https://example.com/a.json", "https://example.com/b.json"],
  });
  assert.equal(body.returnEntities, true);
  assert.equal(body.fields[0].filter.type, "IN");
  assert.deepEqual(body.fields[0].filter.values, [
    "https://example.com/a.json",
    "https://example.com/b.json",
  ]);
});

test("submit requires items, locales, a review choice, and a due date", () => {
  const errors = submission.validateSubmission(
    { items: [], targetLocales: [], review: "opal", dueDate: "2026-11-01" },
    "2026-11-04"
  );
  assert.equal(errors.length, 4);
  assert.deepEqual(
    submission.validateSubmission(
      {
        items: [{ id: "1" }],
        targetLocales: ["de-DE"],
        review: "xtm",
        dueDate: "2026-11-04",
      },
      "2026-11-04"
    ),
    []
  );
});

test("a source file keeps the Amplience body and the content item id", () => {
  const file = submission.toSourceFile({
    id: "item-1",
    version: 3,
    locale: "en",
    label: "Hero",
    body: { _meta: { schema: "https://example.com/hero.json", deliveryKey: "hero" }, title: "Hello" },
  });
  assert.equal(file.contentItemId, "item-1");
  assert.equal(file.body.title, "Hello");
  assert.throws(() => submission.toSourceFile({ id: "item-1" }), /body/);
});

test("the Pantheon payload records the review choice and does not reshape the JSON", () => {
  const payload = submission.buildPayload({
    clientRequestId: "req-1",
    hubId: "hub-1",
    hubName: "epson-emear-dev",
    sourceLocale: "en",
    targetLocales: ["fr-FR"],
    dueDate: "2026-11-20",
    review: "none",
    items: [
      {
        contentItemId: "item-1",
        label: "Hero",
        schema: "https://example.com/hero.json",
        locale: "en",
        deliveryKey: "hero",
        version: 3,
        body: { title: "Hello", sku: "ABC" },
      },
    ],
  });
  assert.equal(payload.review, "none");
  assert.deepEqual(payload.items[0].body, { title: "Hello", sku: "ABC" });
});

test("status from Pantheon maps onto the tab statuses", () => {
  assert.equal(submission.mapRemoteStatus("in_progress"), "in-translation");
  assert.equal(submission.mapRemoteStatus("review"), "in-review");
  assert.equal(submission.mapRemoteStatus("delivered"), "complete");
  assert.equal(submission.mapRemoteStatus("error"), "failed");
  assert.equal(submission.mapRemoteStatus("unknown"), null);
});

test("refresh keeps the local request and applies the Pantheon status", () => {
  const merged = submission.mergeRemoteRequests(
    [
      {
        id: "req-1",
        status: "submitted",
        projectId: "100",
        error: null,
        review: "xtm",
      },
    ],
    [{ clientRequestId: "req-1", status: "in_review", projectId: "100", error: null }]
  );
  assert.equal(merged[0].status, "in-review");
  assert.equal(merged[0].review, "xtm");
  assert.equal(submission.reviewLabel("xtm"), "Review in XTM");
  assert.equal(submission.reviewLabel("none"), "No human review");
});

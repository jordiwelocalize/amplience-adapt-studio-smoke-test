"use strict";

const MAX_ITEMS = 25;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fileBaseName(item, index) {
  const label = text(item && item.label)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const id = text(item && item.contentItemId)
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .slice(0, 24);
  const base = [label || "content", id || String(index + 1)].filter(Boolean).join("-");
  return base.slice(0, 90);
}

function validatePayload(payload) {
  const errors = [];
  const body = payload && typeof payload === "object" ? payload : {};
  const items = Array.isArray(body.items) ? body.items : [];
  const targets = Array.isArray(body.targetLocales) ? body.targetLocales.map(text).filter(Boolean) : [];

  if (!text(body.clientRequestId)) errors.push("clientRequestId is required.");
  if (!text(body.hubId)) errors.push("hubId is required.");
  if (!text(body.sourceLocale)) errors.push("sourceLocale is required.");
  if (!text(body.dueDate)) errors.push("dueDate is required.");
  if (body.review !== "none" && body.review !== "xtm") errors.push("review must be none or xtm.");
  if (!items.length) errors.push("At least one content item is required.");
  if (items.length > MAX_ITEMS) errors.push("At most " + MAX_ITEMS + " content items are allowed.");
  if (!targets.length) errors.push("At least one target locale is required.");
  items.forEach(function (item, index) {
    if (!item || !text(item.contentItemId) || !item.body || typeof item.body !== "object" || Array.isArray(item.body)) {
      errors.push("Content item " + (index + 1) + " needs an id and a JSON body.");
    }
  });
  return errors;
}

function toCreateProjectBody(payload, serviceId) {
  const targets = [];
  (payload.targetLocales || []).forEach(function (target) {
    const code = text(target);
    if (code && targets.indexOf(code) === -1) targets.push(code);
  });
  const source = text(payload.sourceLocale);
  const hub = text(payload.hubName) || "Amplience";
  const labels = (payload.items || [])
    .map(function (item) {
      return text(item.label);
    })
    .filter(Boolean);
  const subject = labels.length === 1 ? labels[0] : payload.items.length + " content items";
  const name = (hub + ": " + subject).slice(0, 180);

  return {
    projectReferenceId: text(payload.clientRequestId),
    name: name,
    dueDate: text(payload.dueDate),
    languages: targets.map(function (target) {
      return { source: source, target: target };
    }),
    services: [{ id: Number(serviceId) }],
    extraProjectInfo: {
      hubId: text(payload.hubId),
      hubName: text(payload.hubName),
      review: payload.review,
      contentItemIds: (payload.items || []).map(function (item) {
        return text(item.contentItemId);
      }),
    },
  };
}

function toWorkFiles(payload) {
  return (payload.items || []).map(function (item, index) {
    const base = fileBaseName(item, index);
    return {
      filename: base + ".json",
      asset: { name: base, type: "work" },
      content: item.body,
    };
  });
}

function extensionStatus(clientApiStatus) {
  const status = text(clientApiStatus).toLowerCase();
  if (status === "completed" || status === "complete" || status === "delivered") return "delivered";
  if (status === "error" || status === "cancelled" || status === "lost") return "error";
  if (
    status === "in progress" ||
    status === "in-progress" ||
    status === "processing" ||
    status === "in scoping" ||
    status === "in-scoping"
  ) {
    return "in_progress";
  }
  return "submitted";
}

module.exports = {
  MAX_ITEMS: MAX_ITEMS,
  validatePayload: validatePayload,
  toCreateProjectBody: toCreateProjectBody,
  toWorkFiles: toWorkFiles,
  extensionStatus: extensionStatus,
};

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.WelocalizeSubmission = api;
})(typeof self !== "undefined" ? self : this, function () {
  var MAX_ITEMS = 25;

  var DEFAULT_TARGET_LOCALES = [
    "bg-BG",
    "cs-CZ",
    "da-DK",
    "de-AT",
    "de-CH",
    "de-DE",
    "el-GR",
    "en-IE",
    "es-ES",
    "et-EE",
    "fi-FI",
    "fr-BE",
    "fr-CH",
    "fr",
    "fr-FR",
    "hr-HR",
    "hu-HU",
    "it-CH",
    "it-IT",
    "lt-LT",
    "lv-LV",
    "mt-MT",
    "nl-BE",
    "nl-NL",
    "no-NO",
    "pl-PL",
    "pt-PT",
    "ro-RO",
    "sk-SK",
    "sl-SI",
    "sr-RS",
    "sv-SE",
  ];

  var STATUS_MAP = {
    submitted: "submitted",
    created: "submitted",
    new: "submitted",
    "in-translation": "in-translation",
    in_translation: "in-translation",
    translating: "in-translation",
    "in-progress": "in-translation",
    in_progress: "in-translation",
    "in-review": "in-review",
    in_review: "in-review",
    review: "in-review",
    complete: "complete",
    completed: "complete",
    done: "complete",
    delivered: "complete",
    failed: "failed",
    error: "failed",
  };

  function cleanToken(value) {
    return String(value || "").replace(/["\\]/g, "").trim();
  }

  function readSettings(installation) {
    var params = installation && typeof installation === "object" ? installation : {};
    var statuses = params.statuses && typeof params.statuses === "object" ? params.statuses : {};
    var targetLocales =
      Array.isArray(params.targetLocales) && params.targetLocales.length
        ? params.targetLocales.map(cleanToken).filter(Boolean)
        : DEFAULT_TARGET_LOCALES.slice();
    var contentTypeUris = Array.isArray(params.contentTypeUris)
      ? params.contentTypeUris.map(cleanToken).filter(Boolean)
      : [];

    return {
      sourceLocale: cleanToken(params.sourceLocale) || "en",
      targetLocales: targetLocales,
      contentTypeUris: contentTypeUris,
      submissionUrl: typeof params.submissionUrl === "string" ? params.submissionUrl.trim() : "",
      readyStateId: cleanToken(statuses.ready),
      inProgressStateId: cleanToken(statuses.inProgress),
    };
  }

  function findWorkflowState(states, options) {
    var list = Array.isArray(states) ? states : [];
    var names = ((options && options.names) || []).map(function (name) {
      return String(name || "").toLowerCase();
    });
    var match = list.find(function (state) {
      var label = ((state && state.label) || "") + " " + ((state && state.name) || "");
      label = label.toLowerCase();
      return names.some(function (name) {
        return name && label.indexOf(name) !== -1;
      });
    });
    if (match && match.id) return match.id;
    return (options && options.id) || null;
  }

  function buildSearchQuery(input) {
    var parts = ['status:"ACTIVE"'];
    var sourceLocale = cleanToken(input && input.sourceLocale);
    var readyStateId = cleanToken(input && input.readyStateId);
    var schema = cleanToken(input && input.schema);
    var text = cleanToken(input && input.text);
    if (sourceLocale) parts.push('locale:"' + sourceLocale + '"');
    if (readyStateId) parts.push('workflow.state:"' + readyStateId + '"');
    if (schema) parts.push('schema:"' + schema + '"');
    if (text) parts.push('"' + text + '"');
    return parts.join(" AND ");
  }

  function buildFacetBody(input) {
    var fields = [];
    var schema = cleanToken(input && input.schema);
    var schemas = schema ? [schema] : (input && input.contentTypeUris) || [];
    var sourceLocale = cleanToken(input && input.sourceLocale);
    var readyStateId = cleanToken(input && input.readyStateId);

    if (schemas.length) {
      fields.push({
        facetAs: "ENUM",
        field: "schema",
        filter: {
          type: schemas.length === 1 ? "EQ" : "IN",
          values: schemas,
        },
      });
    }
    if (sourceLocale) {
      fields.push({
        facetAs: "ENUM",
        field: "locale",
        filter: { type: "EQ", values: [sourceLocale] },
      });
    }
    if (readyStateId) {
      fields.push({
        facetAs: "ENUM",
        field: "workflow.state",
        filter: { type: "EQ", values: [readyStateId] },
      });
    }
    if (!fields.length) {
      fields.push({ facetAs: "ENUM", field: "schema" });
    }
    return { fields: fields, returnEntities: true };
  }

  function validateSubmission(input, today) {
    var errors = [];
    var items = (input && input.items) || [];
    var targets = (input && input.targetLocales) || [];
    var day = today || new Date().toISOString().slice(0, 10);

    if (!items.length) errors.push("Select at least one content item.");
    if (items.length > MAX_ITEMS) errors.push("Select at most " + MAX_ITEMS + " content items.");
    if (!targets.length) errors.push("Select at least one target locale.");
    if (!input || (input.review !== "none" && input.review !== "xtm")) {
      errors.push("Choose no human review or review in XTM.");
    }
    if (!input || !input.dueDate) errors.push("Enter a due date.");
    else if (input.dueDate < day) errors.push("Due date cannot be in the past.");
    return errors;
  }

  function toSourceFile(item) {
    var body = item && item.body;
    if (!item || !item.id || !body || typeof body !== "object") {
      throw new Error("Amplience did not return the content item body.");
    }
    var meta = body._meta || {};
    return {
      contentItemId: item.id,
      label: item.label || meta.name || item.id,
      schema: meta.schema || item.schema || "",
      locale: item.locale || "",
      deliveryKey: meta.deliveryKey || "",
      version: item.version,
      body: body,
    };
  }

  function buildPayload(input) {
    return {
      clientRequestId: input.clientRequestId,
      hubId: input.hubId,
      hubName: input.hubName || "",
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales.slice(),
      dueDate: input.dueDate,
      review: input.review,
      items: input.items.map(function (item) {
        return {
          contentItemId: item.contentItemId,
          label: item.label,
          schema: item.schema,
          locale: item.locale,
          deliveryKey: item.deliveryKey,
          version: item.version,
          body: item.body,
        };
      }),
    };
  }

  function createLocalRequest(input) {
    return {
      id: input.clientRequestId,
      createdAt: input.createdAt,
      status: input.status || "submitted",
      projectId: input.projectId || null,
      error: input.error || null,
      warnings: input.warnings || [],
      handoff: input.handoff,
      review: input.review,
      dueDate: input.dueDate,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales.slice(),
      items: input.items.map(function (item) {
        return {
          contentItemId: item.contentItemId,
          label: item.label,
          schema: item.schema,
          locale: item.locale,
          deliveryKey: item.deliveryKey,
        };
      }),
    };
  }

  function mapRemoteStatus(status) {
    if (!status) return null;
    return STATUS_MAP[String(status).toLowerCase()] || null;
  }

  function reviewLabel(review) {
    if (review === "xtm") return "Review in XTM";
    if (review === "none") return "No human review";
    return "Not set";
  }

  function statusLabel(status) {
    if (status === "in-translation") return "In translation";
    if (status === "in-review") return "In review";
    if (status === "complete") return "Complete";
    if (status === "failed") return "Failed";
    if (status === "submitted") return "Submitted";
    return "Submitted";
  }

  function mergeRemoteRequests(localRequests, remoteRequests) {
    var remoteById = {};
    (remoteRequests || []).forEach(function (remote) {
      var id = remote.clientRequestId || remote.id;
      if (id) remoteById[id] = remote;
    });
    return (localRequests || []).map(function (local) {
      var remote = remoteById[local.id];
      if (!remote) return local;
      var status = mapRemoteStatus(remote.status) || local.status;
      return Object.assign({}, local, {
        status: status,
        projectId: remote.projectId || local.projectId || null,
        error: remote.error || null,
      });
    });
  }

  function storageKey(hubId) {
    return "welocalize-amplience-requests:" + (hubId || "unknown");
  }

  return {
    MAX_ITEMS: MAX_ITEMS,
    DEFAULT_TARGET_LOCALES: DEFAULT_TARGET_LOCALES,
    readSettings: readSettings,
    findWorkflowState: findWorkflowState,
    buildSearchQuery: buildSearchQuery,
    buildFacetBody: buildFacetBody,
    validateSubmission: validateSubmission,
    toSourceFile: toSourceFile,
    buildPayload: buildPayload,
    createLocalRequest: createLocalRequest,
    mapRemoteStatus: mapRemoteStatus,
    reviewLabel: reviewLabel,
    statusLabel: statusLabel,
    mergeRemoteRequests: mergeRemoteRequests,
    storageKey: storageKey,
  };
});

(function () {
  var submission = window.WelocalizeSubmission;
  var amplience = window.WelocalizeAmplience;

  var state = {
    sdk: null,
    settings: submission.readSettings(null),
    hubId: "",
    hubName: "",
    readyStateId: null,
    inProgressStateId: null,
    tab: "content",
    items: [],
    page: { number: 0, totalPages: 1, totalElements: 0 },
    selected: {},
    requests: [],
    openRequestId: null,
    text: "",
    schema: "",
    message: "",
    messageTone: "",
    busy: false,
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function today() {
    var now = new Date();
    var month = String(now.getMonth() + 1).padStart(2, "0");
    var day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "-" + month + "-" + day;
  }

  function showMessage(text, tone) {
    state.message = text || "";
    state.messageTone = tone || "";
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(submission.storageKey(state.hubId));
      var parsed = raw ? JSON.parse(raw) : [];
      state.requests = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      state.requests = [];
    }
  }

  function writeStore() {
    localStorage.setItem(submission.storageKey(state.hubId), JSON.stringify(state.requests));
  }

  function previewSdk() {
    return {
      hub: { id: "preview-hub", name: "Preview hub" },
      params: {
        installation: {
          sourceLocale: "en",
          targetLocales: ["de-DE", "fr-FR"],
          submissionUrl: "",
        },
      },
      client: {
        request: async function (config) {
          var url = config.url || "";
          if (url.indexOf("workflow-states") !== -1) {
            return {
              status: 200,
              data: {
                _embedded: {
                  "workflow-states": [
                    { id: "ready", label: "Ready" },
                    { id: "progress", label: "In progress" },
                  ],
                },
              },
            };
          }
          if (url.indexOf("/facet") !== -1) {
            return {
              status: 200,
              data: {
                _embedded: {
                  "content-items": [
                    {
                      id: "item-1",
                      label: "Hero banner",
                      locale: "en",
                      schema: "https://example.com/hero.json",
                      lastModifiedDate: "2026-11-01T00:00:00.000Z",
                    },
                  ],
                },
                page: { number: 0, totalPages: 1, totalElements: 1 },
              },
            };
          }
          if (config.method === "GET" && url.indexOf("content-items/item-1") !== -1) {
            return {
              status: 200,
              data: {
                id: "item-1",
                label: "Hero banner",
                locale: "en",
                version: 4,
                body: {
                  _meta: {
                    name: "Hero banner",
                    schema: "https://example.com/hero.json",
                    deliveryKey: "hero",
                  },
                  title: "Hello",
                },
              },
            };
          }
          return { status: 200, data: {} };
        },
      },
    };
  }

  async function connect() {
    var root = document.getElementById("app");
    root.textContent = "";
    root.appendChild(el("p", "status", "Connecting…"));
    if (location.hash === "#preview") {
      try {
        await start(previewSdk());
      } catch (error) {
        renderDisconnected();
      }
      return;
    }
    if (!window.dcExtensionsSdk || typeof window.dcExtensionsSdk.init !== "function") {
      renderDisconnected();
      return;
    }
    try {
      await start(await window.dcExtensionsSdk.init({ connectionTimeout: 15000 }));
    } catch (error) {
      renderDisconnected();
    }
  }

  async function start(sdk) {
    state.sdk = sdk;
    state.hubId = (sdk.hub && sdk.hub.id) || "";
    state.hubName = (sdk.hub && sdk.hub.name) || "this hub";
    state.settings = submission.readSettings(sdk.params && sdk.params.installation);
    readStore();
    await loadWorkflowStates();
    await loadContent();
    render();
  }

  function renderDisconnected() {
    var root = document.getElementById("app");
    root.textContent = "";
    root.appendChild(el("h1", null, "Welocalize translation"));
    root.appendChild(
      el("p", "status", "Not connected. Open this page from the Amplience dashboard tab.")
    );
  }

  async function loadWorkflowStates() {
    var states = [];
    try {
      states = await amplience.listWorkflowStates(state.sdk, state.hubId);
    } catch (error) {
      states = [];
    }
    state.readyStateId = submission.findWorkflowState(states, {
      id: state.settings.readyStateId,
      names: ["ready"],
    });
    state.inProgressStateId = submission.findWorkflowState(states, {
      id: state.settings.inProgressStateId,
      names: ["in progress", "inprogress"],
    });
  }

  async function loadContent() {
    state.busy = true;
    render();
    try {
      var query = submission.buildSearchQuery({
        sourceLocale: state.settings.sourceLocale,
        readyStateId: state.readyStateId,
        schema: state.schema,
        text: state.text,
      });
      var body = submission.buildFacetBody({
        sourceLocale: state.settings.sourceLocale,
        readyStateId: state.readyStateId,
        schema: state.schema,
        contentTypeUris: state.settings.contentTypeUris,
      });
      var result = await amplience.searchContent(state.sdk, state.hubId, query, body, state.page.number || 0);
      state.items = result.items;
      state.page = result.page;
      showMessage("", "");
    } catch (error) {
      state.items = [];
      showMessage(error.message || "Could not load content.", "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  function selectedItems() {
    return Object.keys(state.selected).map(function (id) {
      return state.selected[id];
    });
  }

  function selectedLocales(form) {
    return Array.prototype.filter
      .call(form.querySelectorAll('input[name="locale"]:checked'), function (input) {
        return input.value;
      })
      .map(function (input) {
        return input.value;
      });
  }

  async function onSubmit(event) {
    event.preventDefault();
    var form = event.target;
    var review = form.querySelector('input[name="review"]:checked');
    var input = {
      items: selectedItems(),
      targetLocales: selectedLocales(form),
      review: review ? review.value : "",
      dueDate: form.dueDate.value,
    };
    var errors = submission.validateSubmission(
      {
        items: input.items,
        targetLocales: input.targetLocales,
        review: input.review,
        dueDate: input.dueDate,
      },
      today()
    );
    if (errors.length) {
      showMessage(errors[0], "error");
      render();
      return;
    }

    state.busy = true;
    showMessage("Submitting…", "");
    render();

    var clientRequestId = crypto.randomUUID();
    var files = [];
    try {
      for (var i = 0; i < input.items.length; i += 1) {
        var full = await amplience.getContentItem(state.sdk, input.items[i].id);
        files.push(submission.toSourceFile(full));
      }

      var payload = submission.buildPayload({
        clientRequestId: clientRequestId,
        hubId: state.hubId,
        hubName: state.hubName,
        sourceLocale: state.settings.sourceLocale,
        targetLocales: input.targetLocales,
        dueDate: input.dueDate,
        review: input.review,
        items: files,
      });

      var handoff = "local";
      var projectId = null;
      var status = "submitted";
      var errorText = null;
      var warnings = [];

      if (state.settings.submissionUrl) {
        var remote = await amplience.postSubmission(state.settings.submissionUrl, payload);
        handoff = "pantheon";
        projectId = remote.projectId;
        status = submission.mapRemoteStatus(remote.status) || "submitted";
        if (state.inProgressStateId) {
          for (var n = 0; n < files.length; n += 1) {
            try {
              await amplience.setWorkflowState(
                state.sdk,
                files[n].contentItemId,
                files[n].version,
                state.inProgressStateId
              );
            } catch (workflowError) {
              warnings.push(files[n].label + " stayed in its current workflow state.");
            }
          }
        } else {
          warnings.push("No In progress workflow state is configured, so the source items were left unchanged.");
        }
      } else {
        errorText = null;
        warnings.push(
          "Held in this browser. A Pantheon project is created when the handoff URL is set on the extension."
        );
      }

      var record = submission.createLocalRequest({
        clientRequestId: clientRequestId,
        createdAt: new Date().toISOString(),
        status: status,
        projectId: projectId,
        error: errorText,
        warnings: warnings,
        handoff: handoff,
        review: input.review,
        dueDate: input.dueDate,
        sourceLocale: state.settings.sourceLocale,
        targetLocales: input.targetLocales,
        items: files,
      });
      state.requests.unshift(record);
      writeStore();
      state.selected = {};
      state.tab = "requests";
      state.openRequestId = record.id;
      showMessage(
        handoff === "pantheon" ? "Translation request created." : "Request saved in this browser.",
        "ok"
      );
    } catch (error) {
      var failed = submission.createLocalRequest({
        clientRequestId: clientRequestId,
        createdAt: new Date().toISOString(),
        status: "failed",
        error: error.message || "The request failed.",
        warnings: [],
        handoff: state.settings.submissionUrl ? "pantheon" : "local",
        review: input.review,
        dueDate: input.dueDate,
        sourceLocale: state.settings.sourceLocale,
        targetLocales: input.targetLocales,
        items: input.items.map(function (item) {
          var fetched = files.find(function (file) {
            return file.contentItemId === item.id;
          });
          return (
            fetched || {
              contentItemId: item.id,
              label: item.label || item.id,
              schema: item.schema || "",
              locale: item.locale || "",
              deliveryKey: "",
            }
          );
        }),
      });
      state.requests.unshift(failed);
      writeStore();
      state.tab = "requests";
      state.openRequestId = failed.id;
      showMessage(failed.error, "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  async function refreshStatus() {
    if (!state.settings.submissionUrl) {
      showMessage("Status is stored in this browser until a handoff URL is set.", "");
      render();
      return;
    }
    state.busy = true;
    render();
    try {
      var remote = await amplience.fetchSubmissions(state.settings.submissionUrl, state.hubId);
      state.requests = submission.mergeRemoteRequests(state.requests, remote);
      writeStore();
      showMessage("Status refreshed.", "ok");
    } catch (error) {
      showMessage(error.message || "Could not refresh status.", "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  function render() {
    var root = document.getElementById("app");
    var scroll = root.querySelector(".content");
    var scrollTop = scroll ? scroll.scrollTop : 0;
    root.textContent = "";

    var header = el("header", "header");
    header.appendChild(el("h1", null, "Welocalize translation"));
    header.appendChild(el("p", "hub", state.hubName));
    root.appendChild(header);

    if (state.message) {
      root.appendChild(el("p", "banner " + (state.messageTone || "info"), state.message));
    }

    var tabs = el("div", "tabs");
    tabs.appendChild(tabButton("content", "Content"));
    tabs.appendChild(tabButton("requests", "Requests"));
    root.appendChild(tabs);

    var content = el("div", "content");
    if (state.tab === "content") renderContent(content);
    else renderRequests(content);
    root.appendChild(content);
    content.scrollTop = scrollTop;
  }

  function tabButton(id, label) {
    var button = el("button", "tab" + (state.tab === id ? " active" : ""), label);
    button.type = "button";
    button.disabled = state.busy;
    button.addEventListener("click", function () {
      state.tab = id;
      showMessage("", "");
      render();
    });
    return button;
  }

  function renderContent(content) {
    var filters = el("form", "filters");
    filters.addEventListener("submit", function (event) {
      event.preventDefault();
      state.text = filters.query.value;
      state.schema = filters.schema.value.trim();
      state.page = { number: 0, totalPages: 1, totalElements: 0 };
      loadContent();
    });
    var search = el("input");
    search.name = "query";
    search.type = "search";
    search.placeholder = "Search content";
    search.value = state.text;
    filters.appendChild(search);
    var schema = el("input");
    schema.name = "schema";
    schema.type = "text";
    schema.placeholder = "Content type URL";
    schema.value = state.schema;
    filters.appendChild(schema);
    var searchButton = el("button", null, "Search");
    searchButton.type = "submit";
    searchButton.disabled = state.busy;
    filters.appendChild(searchButton);
    content.appendChild(filters);

    var note = el(
      "p",
      "note",
      "Source locale " +
        state.settings.sourceLocale +
        ". " +
        (state.readyStateId
          ? "Showing items in the Ready workflow state."
          : "No Ready workflow state is configured, so every active item in the source locale is listed.")
    );
    content.appendChild(note);

    if (!state.items.length) {
      content.appendChild(el("p", "empty", state.busy ? "Loading content…" : "No content items match."));
    } else {
      var table = el("table");
      var head = el("tr");
      head.appendChild(el("th", null, ""));
      head.appendChild(el("th", null, "Content"));
      head.appendChild(el("th", null, "Locale"));
      head.appendChild(el("th", null, "Updated"));
      table.appendChild(head);
      state.items.forEach(function (item) {
        var row = el("tr");
        var cell = el("td");
        var box = el("input");
        box.type = "checkbox";
        box.setAttribute("aria-label", item.label || item.id);
        box.checked = Boolean(state.selected[item.id]);
        box.addEventListener("change", function () {
          if (box.checked) {
            state.selected[item.id] = {
              id: item.id,
              label: item.label || item.id,
              schema: item.schema || "",
              locale: item.locale || "",
            };
          } else {
            delete state.selected[item.id];
          }
        });
        cell.appendChild(box);
        row.appendChild(cell);
        var name = el("td");
        name.appendChild(el("strong", null, item.label || item.id));
        var schemaText = item.schema || (item.body && item.body._meta && item.body._meta.schema) || "";
        if (schemaText) name.appendChild(el("span", "schema", schemaText));
        row.appendChild(name);
        row.appendChild(el("td", null, item.locale || ""));
        row.appendChild(el("td", null, (item.lastModifiedDate || "").slice(0, 10)));
        table.appendChild(row);
      });
      content.appendChild(table);
    }

    var pager = el("div", "pager");
    var prev = el("button", null, "Previous");
    prev.type = "button";
    prev.disabled = state.busy || !state.page.number;
    prev.addEventListener("click", function () {
      state.page.number -= 1;
      loadContent();
    });
    var next = el("button", null, "Next");
    next.type = "button";
    next.disabled = state.busy || state.page.number + 1 >= (state.page.totalPages || 1);
    next.addEventListener("click", function () {
      state.page.number += 1;
      loadContent();
    });
    pager.appendChild(prev);
    pager.appendChild(
      el(
        "span",
        null,
        state.page.totalElements
          ? state.page.totalElements + " items"
          : ""
      )
    );
    pager.appendChild(next);
    content.appendChild(pager);

    content.appendChild(renderSubmitForm());
  }

  function renderSubmitForm() {
    var form = el("form", "submit");
    form.addEventListener("submit", onSubmit);
    form.appendChild(el("h2", null, "Send for translation"));

    var locales = el("fieldset");
    locales.appendChild(el("legend", null, "Target locales"));
    var grid = el("div", "locales");
    state.settings.targetLocales.forEach(function (locale) {
      var label = el("label");
      var box = el("input");
      box.type = "checkbox";
      box.name = "locale";
      box.value = locale;
      label.appendChild(box);
      label.appendChild(document.createTextNode(locale));
      grid.appendChild(label);
    });
    locales.appendChild(grid);
    form.appendChild(locales);

    var due = el("label", "field");
    due.appendChild(document.createTextNode("Due date"));
    var date = el("input");
    date.type = "date";
    date.name = "dueDate";
    date.required = true;
    date.min = today();
    due.appendChild(date);
    form.appendChild(due);

    var review = el("fieldset");
    review.appendChild(el("legend", null, "Human review"));
    review.appendChild(radio("review", "none", "No human review"));
    review.appendChild(radio("review", "xtm", "Review in XTM"));
    form.appendChild(review);

    var button = el("button", "primary", state.busy ? "Submitting…" : "Submit");
    button.type = "submit";
    button.disabled = state.busy;
    form.appendChild(button);
    form.appendChild(
      el("p", "note", "Up to " + submission.MAX_ITEMS + " content items. The Amplience JSON is sent as stored.")
    );
    return form;
  }

  function radio(name, value, label) {
    var node = el("label", "choice");
    var input = el("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.required = true;
    node.appendChild(input);
    node.appendChild(document.createTextNode(label));
    return node;
  }

  function renderRequests(content) {
    var toolbar = el("div", "toolbar");
    var refresh = el("button", null, "Refresh");
    refresh.type = "button";
    refresh.disabled = state.busy;
    refresh.addEventListener("click", refreshStatus);
    toolbar.appendChild(refresh);
    content.appendChild(toolbar);

    if (!state.requests.length) {
      content.appendChild(el("p", "empty", "No translation requests yet."));
      return;
    }

    state.requests.forEach(function (request) {
      var card = el("article", "request");
      var title = el("button", "request-title");
      title.type = "button";
      title.appendChild(el("strong", null, requestLabel(request)));
      title.appendChild(el("span", "pill " + request.status, submission.statusLabel(request.status)));
      title.addEventListener("click", function () {
        state.openRequestId = state.openRequestId === request.id ? null : request.id;
        render();
      });
      card.appendChild(title);
      card.appendChild(
        el(
          "p",
          "meta",
          request.dueDate + " · " + submission.reviewLabel(request.review) + " · " + request.targetLocales.join(", ")
        )
      );
      if (state.openRequestId === request.id) card.appendChild(renderRequestDetail(request));
      content.appendChild(card);
    });
  }

  function requestLabel(request) {
    var count = request.items.length;
    var first = count ? request.items[0].label : "Request";
    if (count > 1) return first + " +" + (count - 1);
    return first;
  }

  function renderRequestDetail(request) {
    var detail = el("div", "detail");
    if (request.projectId) detail.appendChild(el("p", null, "Pantheon project " + request.projectId));
    if (request.error) detail.appendChild(el("p", "error-text", request.error));
    (request.warnings || []).forEach(function (warning) {
      detail.appendChild(el("p", "note", warning));
    });
    detail.appendChild(el("h3", null, "Source items"));
    var list = el("ul");
    request.items.forEach(function (item) {
      var line = el("li");
      line.appendChild(el("strong", null, item.label));
      line.appendChild(document.createTextNode(" · " + item.contentItemId));
      if (item.locale) line.appendChild(document.createTextNode(" · " + item.locale));
      list.appendChild(line);
    });
    detail.appendChild(list);
    detail.appendChild(el("h3", null, "Target locales"));
    detail.appendChild(el("p", null, request.targetLocales.join(", ")));
    detail.appendChild(el("h3", null, "Review"));
    detail.appendChild(el("p", null, submission.reviewLabel(request.review)));
    return detail;
  }

  document.addEventListener("DOMContentLoaded", connect);
})();

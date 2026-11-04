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
    chosenLocales: {},
    localeFilter: "",
    dueDate: "",
    humanReview: false,
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

  function brandMark() {
    var brand = el("div", "brand");
    var logo = document.createElement("img");
    logo.className = "logo";
    logo.src = "assets/welocalize-logo.svg";
    logo.alt = "Welocalize";
    brand.appendChild(logo);
    brand.appendChild(el("p", "product", "Translation"));
    return brand;
  }

  function pageHeader(hubName) {
    var header = el("header", "header");
    var row = el("div", "header-row");
    row.appendChild(brandMark());
    if (hubName) row.appendChild(el("p", "hub", hubName));
    header.appendChild(row);
    header.appendChild(el("div", "accent"));
    return header;
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

  function previewItems() {
    return [
      {
        id: "item-1",
        label: "Hero banner",
        locale: "en",
        schema: "https://www.epson.com/hero.json",
        lastModifiedDate: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "item-2",
        label: "Homepage intro",
        locale: "en",
        schema: "https://www.epson.com/text.json",
        lastModifiedDate: "2026-10-28T00:00:00.000Z",
      },
      {
        id: "item-3",
        label: "Printer comparison",
        locale: "en",
        schema: "https://www.epson.com/text.json",
        lastModifiedDate: "2026-10-20T00:00:00.000Z",
      },
      {
        id: "item-4",
        label: "EcoTank offer",
        locale: "en",
        schema: "https://www.epson.com/hero.json",
        lastModifiedDate: "2026-10-12T00:00:00.000Z",
      },
      {
        id: "item-5",
        label: "Support accordion",
        locale: "en",
        schema: "https://www.epson.com/accordion.json",
        lastModifiedDate: "2026-09-30T00:00:00.000Z",
      },
    ];
  }

  function previewSdk() {
    return {
      hub: { id: "preview-hub", name: "Preview hub" },
      params: {
        installation: {
          sourceLocale: "en",
          contentTypeUris: [
            "https://www.epson.com/hero.json",
            "https://www.epson.com/text.json",
            "https://www.epson.com/accordion.json",
          ],
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
            var items = previewItems().filter(function (item) {
              var body = config.data || {};
              var schemaField = (body.fields || []).filter(function (field) {
                return field.field === "schema" && field.filter && field.filter.values;
              })[0];
              if (!schemaField) return true;
              return schemaField.filter.values.indexOf(item.schema) !== -1;
            });
            var queryText = "";
            var queryMatch = url.match(/[?&]query=([^&]+)/);
            if (queryMatch) queryText = decodeURIComponent(queryMatch[1]);
            var textMatch = queryText.match(/ AND "([^"]+)"\s*$/);
            if (textMatch) {
              var needle = textMatch[1].toLowerCase();
              items = items.filter(function (item) {
                return (item.label || "").toLowerCase().indexOf(needle) !== -1;
              });
            }
            return {
              status: 200,
              data: {
                _embedded: { "content-items": items },
                page: { number: 0, totalPages: 1, totalElements: items.length },
              },
            };
          }
          var itemMatch = url.match(/content-items\/(item-\d+)/);
          if (config.method === "GET" && itemMatch) {
            var found = previewItems().filter(function (item) {
              return item.id === itemMatch[1];
            })[0];
            if (found) {
              return {
                status: 200,
                data: {
                  id: found.id,
                  label: found.label,
                  locale: found.locale,
                  version: 4,
                  schema: found.schema,
                  body: {
                    _meta: {
                      name: found.label,
                      schema: found.schema,
                      deliveryKey: found.id,
                    },
                    title: found.label,
                  },
                },
              };
            }
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
    root.appendChild(pageHeader());
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

  function chosenLocaleList() {
    return state.settings.targetLocales.filter(function (code) {
      return state.chosenLocales[code];
    });
  }

  function selectionSummaryText() {
    var items = Object.keys(state.selected).length;
    var locales = chosenLocaleList().length;
    return (
      items +
      (items === 1 ? " content item" : " content items") +
      " · " +
      locales +
      (locales === 1 ? " language" : " languages")
    );
  }

  function paintSelectionSummary() {
    var node = document.querySelector("[data-selection-summary]");
    if (!node) return;
    node.textContent = selectionSummaryText();
  }

  async function onSubmit(event) {
    event.preventDefault();
    var form = event.target;
    var humanReview = form.querySelector('input[name="humanReview"]');
    state.dueDate = form.dueDate.value;
    state.humanReview = Boolean(humanReview && humanReview.checked);
    var input = {
      items: selectedItems(),
      targetLocales: chosenLocaleList(),
      review: state.humanReview ? "xtm" : "none",
      dueDate: state.dueDate,
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
    state.submitting = true;
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
          warnings.push("The content status in Amplience was left unchanged.");
        }
      } else {
        errorText = null;
        warnings.push("Saved on this computer. Welocalize has not received this request yet.");
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
        handoff === "pantheon" ? "Translation request sent." : "Request saved on this computer.",
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
      state.submitting = false;
      render();
    }
  }

  async function refreshStatus() {
    if (!state.settings.submissionUrl) {
      showMessage("Status is kept on this computer until requests can be sent.", "");
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

    root.appendChild(pageHeader(state.hubName));

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
    var workspace = el("div", "workspace");
    var finder = el("section", "finder");
    finder.appendChild(el("h2", null, "Find content"));
    finder.appendChild(
      el(
        "p",
        "note",
        submission.localeLabel(state.settings.sourceLocale) +
          (state.readyStateId
            ? " content that is ready to translate."
            : " content in this hub.")
      )
    );

    var filters = el("form", "filters");
    filters.addEventListener("submit", function (event) {
      event.preventDefault();
      state.text = filters.query.value;
      state.page = { number: 0, totalPages: 1, totalElements: 0 };
      loadContent();
    });
    var searchLabel = el("label", "field grow");
    searchLabel.appendChild(document.createTextNode("Search by name"));
    var search = el("input");
    search.name = "query";
    search.type = "search";
    search.placeholder = "Banner, page title, campaign";
    search.value = state.text;
    searchLabel.appendChild(search);
    filters.appendChild(searchLabel);
    if (state.settings.contentTypeUris.length) {
      var typeLabel = el("label", "field");
      typeLabel.appendChild(document.createTextNode("Content type"));
      var select = el("select");
      select.name = "contentType";
      var allTypes = el("option", null, "All content types");
      allTypes.value = "";
      select.appendChild(allTypes);
      state.settings.contentTypeUris.forEach(function (uri) {
        var option = el("option", null, submission.contentTypeLabel(uri));
        option.value = uri;
        select.appendChild(option);
      });
      select.value = state.schema;
      select.addEventListener("change", function () {
        state.schema = select.value;
        state.page = { number: 0, totalPages: 1, totalElements: 0 };
        loadContent();
      });
      typeLabel.appendChild(select);
      filters.appendChild(typeLabel);
    }
    var searchButton = el("button", null, "Search");
    searchButton.type = "submit";
    searchButton.disabled = state.busy;
    filters.appendChild(searchButton);
    finder.appendChild(filters);

    if (!state.items.length) {
      finder.appendChild(el("p", "empty", state.busy ? "Loading content…" : "No content items match."));
    } else {
      var table = el("table");
      var head = el("tr");
      var selectHead = el("th");
      var selectAll = el("input");
      selectAll.type = "checkbox";
      selectAll.setAttribute("aria-label", "Select all on this page");
      var pageIds = state.items.map(function (item) {
        return item.id;
      });
      var selectedOnPage = pageIds.filter(function (id) {
        return state.selected[id];
      }).length;
      selectAll.checked = pageIds.length > 0 && selectedOnPage === pageIds.length;
      selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;
      selectAll.addEventListener("change", function () {
        state.items.forEach(function (item) {
          if (selectAll.checked) {
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
        render();
      });
      selectHead.appendChild(selectAll);
      head.appendChild(selectHead);
      head.appendChild(el("th", null, "Content"));
      head.appendChild(el("th", null, "Type"));
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
          paintSelectionSummary();
        });
        cell.appendChild(box);
        row.appendChild(cell);
        var name = el("td");
        name.appendChild(el("strong", null, item.label || item.id));
        row.appendChild(name);
        var schemaText = item.schema || (item.body && item.body._meta && item.body._meta.schema) || "";
        row.appendChild(el("td", null, schemaText ? submission.contentTypeLabel(schemaText) : ""));
        row.appendChild(el("td", null, (item.lastModifiedDate || "").slice(0, 10)));
        table.appendChild(row);
      });
      finder.appendChild(table);
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
      el("span", null, state.page.totalElements ? state.page.totalElements + " items" : "")
    );
    pager.appendChild(next);
    finder.appendChild(pager);
    workspace.appendChild(finder);
    workspace.appendChild(renderSubmitForm());
    content.appendChild(workspace);
  }

  function renderSubmitForm() {
    var form = el("form", "submit");
    form.addEventListener("submit", onSubmit);
    form.appendChild(el("h2", null, "Send for translation"));
    var summary = el("p", "summary", selectionSummaryText());
    summary.setAttribute("data-selection-summary", "true");
    form.appendChild(summary);

    var locales = el("fieldset");
    locales.appendChild(el("legend", null, "Languages"));
    var localeSearch = el("input");
    localeSearch.type = "search";
    localeSearch.placeholder = "Find a language";
    localeSearch.value = state.localeFilter || "";
    localeSearch.addEventListener("input", function () {
      state.localeFilter = localeSearch.value;
      paintLocaleChoices();
    });
    locales.appendChild(localeSearch);

    var tools = el("div", "locale-tools");
    var selectShown = el("button", "text-button", "Select shown");
    selectShown.type = "button";
    selectShown.addEventListener("click", function () {
      submission.filterLocales(state.settings.targetLocales, state.localeFilter).forEach(function (code) {
        state.chosenLocales[code] = true;
      });
      paintLocaleChoices();
      paintSelectionSummary();
    });
    var clearLocales = el("button", "text-button", "Clear");
    clearLocales.type = "button";
    clearLocales.addEventListener("click", function () {
      state.chosenLocales = {};
      paintLocaleChoices();
      paintSelectionSummary();
    });
    tools.appendChild(selectShown);
    tools.appendChild(clearLocales);
    locales.appendChild(tools);

    var chips = el("div", "chips");
    var list = el("div", "locale-list");
    locales.appendChild(chips);
    locales.appendChild(list);
    form.appendChild(locales);

    function paintLocaleChoices() {
      var selected = chosenLocaleList();
      chips.textContent = "";
      if (!selected.length) {
        chips.appendChild(el("p", "note", "No languages selected."));
      }
      selected.forEach(function (code) {
        var chip = el("button", "chip", submission.localeLabel(code));
        chip.type = "button";
        chip.setAttribute("aria-label", "Remove " + submission.localeLabel(code));
        chip.addEventListener("click", function () {
          delete state.chosenLocales[code];
          paintLocaleChoices();
          paintSelectionSummary();
        });
        chips.appendChild(chip);
      });

      list.textContent = "";
      var shown = submission.filterLocales(state.settings.targetLocales, state.localeFilter);
      if (!shown.length) {
        list.appendChild(el("p", "note", "No languages match."));
        return;
      }
      shown.forEach(function (code) {
        var label = el("label", "locale-option");
        var box = el("input");
        box.type = "checkbox";
        box.name = "locale";
        box.value = code;
        box.checked = Boolean(state.chosenLocales[code]);
        box.addEventListener("change", function () {
          if (box.checked) state.chosenLocales[code] = true;
          else delete state.chosenLocales[code];
          paintLocaleChoices();
          paintSelectionSummary();
        });
        label.appendChild(box);
        label.appendChild(document.createTextNode(submission.localeLabel(code)));
        list.appendChild(label);
      });
    }
    paintLocaleChoices();

    var due = el("label", "field");
    due.appendChild(document.createTextNode("Due date"));
    var date = el("input");
    date.type = "date";
    date.name = "dueDate";
    date.required = true;
    date.min = today();
    date.value = state.dueDate || "";
    date.addEventListener("change", function () {
      state.dueDate = date.value;
    });
    due.appendChild(date);
    form.appendChild(due);

    var review = el("fieldset");
    review.appendChild(el("legend", null, "Human review"));
    var reviewChoice = el("label", "choice");
    var reviewBox = el("input");
    reviewBox.type = "checkbox";
    reviewBox.name = "humanReview";
    reviewBox.checked = state.humanReview;
    reviewBox.addEventListener("change", function () {
      state.humanReview = reviewBox.checked;
    });
    reviewChoice.appendChild(reviewBox);
    reviewChoice.appendChild(document.createTextNode("Request human review"));
    review.appendChild(reviewChoice);
    form.appendChild(review);

    var button = el("button", "primary", state.submitting ? "Submitting…" : "Submit");
    button.type = "submit";
    button.disabled = state.busy;
    form.appendChild(button);
    form.appendChild(el("p", "note", "You can send up to " + submission.MAX_ITEMS + " content items at a time."));
    paintSelectionSummary();
    return form;
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
          request.dueDate +
            " · " +
            submission.reviewLabel(request.review) +
            " · " +
            request.targetLocales.length +
            (request.targetLocales.length === 1 ? " language" : " languages")
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
    detail.appendChild(el("h3", null, "Languages"));
    detail.appendChild(
      el("p", null, request.targetLocales.map(submission.localeLabel).join(", "))
    );
    detail.appendChild(el("h3", null, "Human review"));
    detail.appendChild(el("p", null, submission.reviewLabel(request.review)));
    return detail;
  }

  document.addEventListener("DOMContentLoaded", connect);
})();

(function (root) {
  var API = "https://api.amplience.net/v2/content";

  function extractError(data) {
    if (!data) return "";
    if (typeof data === "string") return data;
    var errors = data.errors || data.error;
    if (Array.isArray(errors) && errors.length && errors[0]) {
      return errors[0].message || errors[0].code || "";
    }
    if (typeof data.message === "string") return data.message;
    return "";
  }

  async function request(sdk, method, path, data) {
    if (!sdk || !sdk.client || typeof sdk.client.request !== "function") {
      throw new Error("This extension needs Read permission on the hub.");
    }
    var response = await sdk.client.request({
      url: path.indexOf("http") === 0 ? path : API + path,
      method: method,
      data: data,
      headers: { "Content-Type": "application/json" },
    });
    if (!response || response.status >= 400) {
      var message = extractError(response && response.data) || "Amplience returned an error.";
      var error = new Error(message);
      error.status = response && response.status;
      throw error;
    }
    return response.data;
  }

  function embeddedList(data, name) {
    if (!data || !data._embedded) return [];
    return data._embedded[name] || [];
  }

  async function listWorkflowStates(sdk, hubId) {
    var data = await request(sdk, "GET", "/hubs/" + encodeURIComponent(hubId) + "/workflow-states?size=100");
    return embeddedList(data, "workflow-states");
  }

  async function searchContent(sdk, hubId, query, body, page) {
    var url =
      "/hubs/" +
      encodeURIComponent(hubId) +
      "/content-items/facet?query=" +
      encodeURIComponent(query) +
      "&page=" +
      encodeURIComponent(page || 0) +
      "&size=20&sort=lastModifiedDate,desc";
    var data = await request(sdk, "POST", url, body);
    return {
      items: embeddedList(data, "content-items"),
      page: data.page || { number: page || 0, totalPages: 1, totalElements: 0 },
    };
  }

  async function getContentItem(sdk, contentItemId) {
    return request(sdk, "GET", "/content-items/" + encodeURIComponent(contentItemId));
  }

  async function setWorkflowState(sdk, contentItemId, version, stateId) {
    return request(sdk, "PATCH", "/content-items/" + encodeURIComponent(contentItemId) + "/workflow", {
      version: version,
      state: stateId,
    });
  }

  async function postSubmission(url, payload) {
    var response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    var data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }
    if (!response.ok) {
      throw new Error(extractError(data) || "The translation request could not be sent.");
    }
    if (!data || !data.projectId) {
      throw new Error("The translation request could not be confirmed.");
    }
    return data;
  }

  async function fetchSubmissions(url, hubId) {
    var join = url.indexOf("?") === -1 ? "?" : "&";
    var response = await fetch(url + join + "hubId=" + encodeURIComponent(hubId));
    if (!response.ok) {
      throw new Error("Could not refresh translation status.");
    }
    var data = await response.json();
    return (data && data.requests) || [];
  }

  root.WelocalizeAmplience = {
    listWorkflowStates: listWorkflowStates,
    searchContent: searchContent,
    getContentItem: getContentItem,
    setWorkflowState: setWorkflowState,
    postSubmission: postSubmission,
    fetchSubmissions: fetchSubmissions,
  };
})(typeof self !== "undefined" ? self : this);

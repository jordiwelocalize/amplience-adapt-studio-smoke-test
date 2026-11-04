"use strict";

function messageFrom(body) {
  if (!body || typeof body !== "object") return "";
  if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  if (typeof body.error === "string" && body.error.trim() && body.error !== "Bad Request") {
    return body.error.trim();
  }
  return "";
}

function unwrap(body) {
  if (body && Object.prototype.hasOwnProperty.call(body, "data")) return body.data;
  return body;
}

class ClientApi {
  constructor(options) {
    this.baseUrl = String(options.baseUrl || "").replace(/\/$/, "");
    this.token = options.token;
    this.fetch = options.fetch || fetch;
  }

  async listServices() {
    const data = await this.request("GET", "/v1/client-api/services");
    return Array.isArray(data) ? data : [];
  }

  async createProject(body) {
    const data = await this.request("POST", "/v1/client-api/project", body);
    const id = data && data.id;
    if (!id) throw new Error("Client API did not return a project id.");
    return id;
  }

  async uploadWorkFile(projectId, file) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([JSON.stringify(file.content)], { type: "application/json" }),
      file.filename
    );
    form.append("asset", JSON.stringify(file.asset));
    return this.request("POST", "/v1/client-api/project/" + projectId + "/file", form);
  }

  async startProject(projectId) {
    return this.request("PUT", "/v1/client-api/project/" + projectId + "/start");
  }

  async projectStatus(projectId) {
    const data = await this.request("GET", "/v1/client-api/project/" + projectId + "/status");
    return data && data.status ? data.status : "";
  }

  async request(method, path, body) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.requestOnce(method, path, body);
      } catch (error) {
        lastError = error;
        const retry = /\(50[234]\)/.test(error.message) && attempt < 2;
        if (!retry) throw error;
        await new Promise(function (resolve) {
          setTimeout(resolve, 400 * (attempt + 1));
        });
      }
    }
    throw lastError;
  }

  async requestOnce(method, path, body) {
    const headers = { "x-pantheon-auth-key": this.token };
    let payload;
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await this.fetch(this.baseUrl + path, {
      method: method,
      headers: headers,
      body: payload,
    });
    let parsed = null;
    const raw = await response.text();
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        parsed = null;
      }
    }
    if (!response.ok) {
      throw new Error(messageFrom(parsed) || "Client API request failed (" + response.status + ").");
    }
    return unwrap(parsed);
  }
}

module.exports = { ClientApi };

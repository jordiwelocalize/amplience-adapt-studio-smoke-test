"use strict";

const map = require("./map-submission");

function createReceiver(options) {
  const clientApi = options.clientApi;
  const store = options.store;
  const serviceId = options.serviceId;

  async function receive(payload) {
    const errors = map.validatePayload(payload);
    if (errors.length) {
      const error = new Error(errors[0]);
      error.statusCode = 400;
      throw error;
    }

    const existing = await store.find(payload.clientRequestId);
    if (existing && existing.projectId && existing.status !== "failed") {
      return { projectId: String(existing.projectId), status: existing.status || "submitted" };
    }

    let projectId = existing && existing.projectId;
    try {
      if (!projectId) {
        const body = map.toCreateProjectBody(payload, serviceId);
        projectId = await clientApi.createProject(body);
      }
      const files = map.toWorkFiles(payload);
      for (const file of files) {
        await clientApi.uploadWorkFile(projectId, file);
      }
      await clientApi.startProject(projectId);
    } catch (error) {
      await store.save({
        clientRequestId: payload.clientRequestId,
        hubId: payload.hubId,
        projectId: projectId ? String(projectId) : null,
        status: "failed",
        error: error.message,
      });
      error.statusCode = error.statusCode || 502;
      throw error;
    }

    const record = {
      clientRequestId: payload.clientRequestId,
      hubId: payload.hubId,
      projectId: String(projectId),
      status: "submitted",
      error: null,
    };
    await store.save(record);
    return { projectId: record.projectId, status: "submitted" };
  }

  async function list(hubId) {
    const records = await store.byHub(hubId);
    const requests = [];
    for (const record of records) {
      let status = record.status;
      if (record.projectId && status !== "failed") {
        try {
          status = map.extensionStatus(await clientApi.projectStatus(record.projectId));
          await store.save(Object.assign({}, record, { status: status, error: null }));
        } catch (error) {
          status = record.status;
        }
      }
      requests.push({
        clientRequestId: record.clientRequestId,
        projectId: record.projectId,
        status: status,
        error: record.error || null,
      });
    }
    return { requests: requests };
  }

  return { receive: receive, list: list };
}

module.exports = { createReceiver };

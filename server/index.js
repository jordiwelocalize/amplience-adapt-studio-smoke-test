"use strict";

const http = require("http");
const { ClientApi } = require("./client-api");
const { createReceiver } = require("./receive");
const { createStore } = require("./store");

function loadEnvFile() {
  const fs = require("fs");
  const path = require("path");
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === "#") return;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    });
}

function readBody(request, limit) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    request.on("data", function (chunk) {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Request body is too large."), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function send(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function resolveServiceId(clientApi) {
  if (process.env.CLIENT_API_SERVICE_ID) return Number(process.env.CLIENT_API_SERVICE_ID);
  const services = await clientApi.listServices();
  if (services.length === 1) return services[0].id;
  throw new Error("Set CLIENT_API_SERVICE_ID. This Client API token can see more than one service.");
}

function createServer(receiver) {
  return http.createServer(async function (request, response) {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      response.end();
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        const hubId = url.searchParams.get("hubId") || "";
        send(response, 200, await receiver.list(hubId));
        return;
      }
      if (request.method === "POST" && url.pathname === "/") {
        const raw = await readBody(request, 5_000_000);
        const payload = raw ? JSON.parse(raw) : {};
        send(response, 200, await receiver.receive(payload));
        return;
      }
      send(response, 404, { message: "Not found." });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : error.statusCode || 500;
      send(response, status, { message: error.message || "The translation request could not be sent." });
    }
  });
}

async function main() {
  loadEnvFile();
  const baseUrl = process.env.CLIENT_API_BASE_URL || "https://hypnos-client-api.welocalize.io";
  const token = process.env.CLIENT_API_TOKEN;
  if (!token) throw new Error("Set CLIENT_API_TOKEN.");
  const clientApi = new ClientApi({ baseUrl: baseUrl, token: token });
  const serviceId = await resolveServiceId(clientApi);
  const receiver = createReceiver({
    clientApi: clientApi,
    store: createStore(),
    serviceId: serviceId,
  });
  const port = Number(process.env.PORT || 8787);
  const server = createServer(receiver);
  server.listen(port, function () {
    process.stdout.write("Amplience handoff listening on " + port + "\n");
  });
}

if (require.main === module) {
  main().catch(function (error) {
    process.stderr.write(error.message + "\n");
    process.exit(1);
  });
}

module.exports = { createServer, loadEnvFile };

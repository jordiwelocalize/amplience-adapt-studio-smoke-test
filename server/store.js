"use strict";

const fs = require("fs");
const path = require("path");

function createStore(filePath) {
  const target = filePath || path.join(__dirname, "data", "requests.json");

  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function write(records) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(records, null, 2));
  }

  return {
    async find(clientRequestId) {
      return read().find(function (record) {
        return record.clientRequestId === clientRequestId;
      }) || null;
    },
    async byHub(hubId) {
      return read().filter(function (record) {
        return record.hubId === hubId;
      });
    },
    async save(record) {
      const records = read();
      const index = records.findIndex(function (item) {
        return item.clientRequestId === record.clientRequestId;
      });
      const next = Object.assign({ createdAt: new Date().toISOString() }, index >= 0 ? records[index] : {}, record);
      if (index >= 0) records[index] = next;
      else records.push(next);
      write(records);
      return next;
    },
  };
}

module.exports = { createStore };

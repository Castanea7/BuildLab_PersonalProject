const test = require("node:test");
const assert = require("node:assert/strict");
const mode = require("../miniprogram/services/mode.js");

test("体验版忽略本地 Mock 缓存并强制使用 Cloud", () => {
  const originalWx = global.wx;
  global.wx = {
    getAccountInfoSync() { return { miniProgram: { envVersion: "trial" } }; },
    getStorageSync() { return "mock"; },
    setStorageSync() {}
  };
  try {
    assert.equal(mode.getServiceMode(), "cloud");
    assert.equal(mode.isCloudMode(), true);
    assert.equal(mode.setServiceMode("mock").data, "cloud");
  } finally {
    if (originalWx === undefined) delete global.wx;
    else global.wx = originalWx;
  }
});

test("开发版仍允许使用本地 Mock/Cloud 切换", () => {
  const originalWx = global.wx;
  let stored = "mock";
  global.wx = {
    getAccountInfoSync() { return { miniProgram: { envVersion: "develop" } }; },
    getStorageSync() { return stored; },
    setStorageSync(key, value) { stored = value; }
  };
  try {
    assert.equal(mode.getServiceMode(), "mock");
    assert.equal(mode.setServiceMode("cloud").data, "cloud");
    assert.equal(mode.getServiceMode(), "cloud");
  } finally {
    if (originalWx === undefined) delete global.wx;
    else global.wx = originalWx;
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const cloud = require("../miniprogram/services/cloud.js");
const services = require("../miniprogram/services/index.js");

test("微信运行时外的 Cloud 适配器返回统一错误结构", async () => {
  const result = await cloud.bootstrapUser();
  assert.equal(result.ok, false);
  assert.equal(result.code, "CLOUD_NOT_AVAILABLE");
  assert.deepEqual(result.error, {
    code: "CLOUD_NOT_AVAILABLE",
    message: "当前运行环境未提供微信云开发能力"
  });
});

test("Cloud 适配器发送统一 action 包络并归一化成功结果", async () => {
  const originalWx = global.wx;
  const calls = [];
  global.wx = {
    cloud: {
      callFunction(options) {
        calls.push(options);
        return Promise.resolve({ result: { ok: true, code: "OK", data: { id: "user-1" }, error: null } });
      }
    }
  };
  try {
    const result = await cloud.bootstrapUser();
    assert.deepEqual(calls, [{ name: "app", data: { action: "bootstrapUser", payload: {} } }]);
    assert.deepEqual(result, { ok: true, code: "OK", data: { id: "user-1" }, error: null });
  } finally {
    if (originalWx === undefined) delete global.wx;
    else global.wx = originalWx;
  }
});

test("服务门面默认使用 Mock 实现", () => {
  assert.equal(services.getServiceMode(), "mock");
  assert.equal(services.isCloudMode(), false);
  assert.equal(services.listTrips().ok, true);
});

test("账单只读 Cloud 适配器发送正确 action 包络", async () => {
  const originalWx = global.wx;
  const calls = [];
  global.wx = {
    cloud: {
      callFunction(options) {
        calls.push(options);
        return Promise.resolve({ result: { ok: true, code: "OK", data: [], error: null } });
      }
    }
  };
  try {
    assert.deepEqual(await cloud.listBills("trip-1"), { ok: true, code: "OK", data: [], error: null });
    assert.deepEqual(await cloud.getBill("bill-1"), { ok: true, code: "OK", data: [], error: null });
    assert.deepEqual(calls, [
      { name: "app", data: { action: "listBills", payload: { tripId: "trip-1" } } },
      { name: "app", data: { action: "getBill", payload: { id: "bill-1" } } }
    ]);
  } finally {
    if (originalWx === undefined) delete global.wx;
    else global.wx = originalWx;
  }
});

test("创建账单 Cloud 适配器保持统一 action 包络", async () => {
  const originalWx = global.wx;
  let call;
  global.wx = {
    cloud: {
      callFunction(options) {
        call = options;
        return Promise.resolve({ result: { ok: true, code: "OK", data: { id: "bill-1" }, error: null } });
      }
    }
  };
  try {
    const input = { tripId: "trip-1", name: "早餐", amount: "12.50", paymentDate: "2026-10-06" };
    assert.deepEqual(await cloud.createBill(input), { ok: true, code: "OK", data: { id: "bill-1" }, error: null });
    assert.deepEqual(call, { name: "app", data: { action: "createBill", payload: input } });
  } finally {
    if (originalWx === undefined) delete global.wx;
    else global.wx = originalWx;
  }
});

test("更新和删除账单 Cloud 适配器携带账单 id 与版本", async () => {
  const originalWx = global.wx;
  const calls = [];
  global.wx = { cloud: { callFunction(options) { calls.push(options); return Promise.resolve({ result: { ok: true, code: "OK", data: null, error: null } }); } } };
  try {
    await cloud.updateBill("bill-1", { expectedVersion: 2, name: "晚餐" });
    await cloud.deleteBill("bill-1", { expectedVersion: 3 });
    assert.deepEqual(calls, [
      { name: "app", data: { action: "updateBill", payload: { expectedVersion: 2, name: "晚餐", id: "bill-1" } } },
      { name: "app", data: { action: "deleteBill", payload: { expectedVersion: 3, id: "bill-1" } } }
    ]);
  } finally {
    if (originalWx === undefined) delete global.wx;
    else global.wx = originalWx;
  }
});

test("清算和报告 Cloud 适配器使用统一 action 包络", async () => {
  const originalWx = global.wx;
  const calls = [];
  global.wx = { cloud: { callFunction(options) { calls.push(options); return Promise.resolve({ result: { ok: true, code: "OK", data: {}, error: null } }); } } };
  try {
    await cloud.previewSettlement("trip-1");
    await cloud.createSettlement("trip-1");
    await cloud.listSettlements("trip-1");
    await cloud.confirmSettlement("settlement-1");
    await cloud.endTrip("trip-1");
    await cloud.getPersonalReport("trip-1");
    assert.deepEqual(calls.map((item) => item.data), [
      { action: "previewSettlement", payload: { tripId: "trip-1" } },
      { action: "createSettlement", payload: { tripId: "trip-1" } },
      { action: "listSettlements", payload: { tripId: "trip-1" } },
      { action: "confirmSettlement", payload: { id: "settlement-1" } },
      { action: "endTrip", payload: { tripId: "trip-1" } },
      { action: "getPersonalReport", payload: { tripId: "trip-1" } }
    ]);
  } finally {
    if (originalWx === undefined) delete global.wx;
    else global.wx = originalWx;
  }
});

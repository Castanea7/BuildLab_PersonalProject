const cloudConfig = require("../config/cloud.js");

function failure(code, message) {
  return { ok: false, code, data: null, error: { code, message } };
}

function normalizeResult(value) {
  const result = value && value.result !== undefined ? value.result : value;
  if (result && typeof result === "object" && typeof result.ok === "boolean" && result.code) return result;
  return failure("INVALID_CLOUD_RESPONSE", "云服务返回格式无效");
}

function call(action, payload = {}) {
  if (typeof wx === "undefined" || !wx.cloud || typeof wx.cloud.callFunction !== "function") {
    return Promise.resolve(failure("CLOUD_NOT_AVAILABLE", "当前运行环境未提供微信云开发能力"));
  }
  return wx.cloud.callFunction({
    name: cloudConfig.FUNCTION_NAME,
    data: { action, payload }
  }).then(normalizeResult).catch(() => failure("CLOUD_CALL_FAILED", "云服务调用失败"));
}

module.exports = {
  call,
  bootstrapUser() { return call("bootstrapUser"); },
  listTrips() { return call("listTrips"); },
  createTrip(input) { return call("createTrip", input); },
  joinTrip(input) { return call("joinTrip", input); },
  getTrip(id) { return call("getTrip", { id }); },
  listMembers(tripId) { return call("listMembers", { tripId }); },
  updateTrip(input) { return call("updateTrip", input); },
  removeMember(tripId, memberId) { return call("removeMember", { tripId, memberId }); },
  getInvite(tripId) { return call("getInvite", { tripId }); },
  listBills(tripId) { return call("listBills", { tripId }); },
  getBill(id) { return call("getBill", { id }); },
  createBill(input) { return call("createBill", input); },
  updateBill(id, input = {}) { return call("updateBill", { ...input, id }); },
  deleteBill(id, input = {}) { return call("deleteBill", { ...input, id }); },
  previewSettlement(tripId) { return call("previewSettlement", { tripId }); },
  createSettlement(tripId) { return call("createSettlement", { tripId }); },
  listSettlements(tripId) { return call("listSettlements", { tripId }); },
  confirmSettlement(id) { return call("confirmSettlement", { id }); },
  endTrip(tripId) { return call("endTrip", { tripId }); },
  getPersonalReport(tripId) { return call("getPersonalReport", { tripId }); }
};

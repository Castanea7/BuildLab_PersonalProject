// 页面只依赖这里的服务接口；Mock 和后续 Cloud 实现保持相同的调用边界。
const mock = require("./mock.js");
const cloud = require("./cloud.js");
const mode = require("./mode.js");
const dispatch = (mockMethod, cloudMethod, args) => mode.isCloudMode() ? cloudMethod(...args) : mockMethod(...args);
function isDevelopmentBuild() {
  try {
    const account = typeof wx !== "undefined" && typeof wx.getAccountInfoSync === "function" ? wx.getAccountInfoSync() : null;
    return Boolean(account && account.miniProgram && account.miniProgram.envVersion === "develop");
  } catch (error) {
    return false;
  }
}
module.exports = {
  isDevelopment: isDevelopmentBuild,
  getServiceMode: mode.getServiceMode, isCloudMode: mode.isCloudMode, setServiceMode: mode.setServiceMode,
  cloudCall: cloud.call, bootstrapUserCloud: cloud.bootstrapUser,
  bootstrapUser: mock.bootstrapUser, getMockState: mock.getMockState, listMockScenarios: mock.listMockScenarios,
  setMockScenario: mock.setMockScenario, resetMockData: mock.resetMockData, listTrips: mock.listTrips,
  listTrips(...args) { return dispatch(mock.listTrips, cloud.listTrips, args); },
  createTrip(...args) { return dispatch(mock.createTrip, cloud.createTrip, args); },
  joinTrip(...args) { return dispatch(mock.joinTrip, cloud.joinTrip, args); },
  getTrip(...args) { return dispatch(mock.getTrip, cloud.getTrip, args); },
  listMembers(...args) { return dispatch(mock.listMembers, cloud.listMembers, args); },
  updateTrip(...args) { return dispatch(() => ({ ok: true, code: "OK", data: null, error: null }), cloud.updateTrip, args); },
  removeMember(...args) { return dispatch(mock.removeMember, cloud.removeMember, args); },
  getInvite(...args) { return dispatch(mock.getInvite, cloud.getInvite, args); },
  listBills(...args) { return dispatch(mock.listBills, cloud.listBills, args); },
  getBill(...args) { return dispatch(mock.getBill, cloud.getBill, args); },
  createBill(...args) { return dispatch(mock.createBill, cloud.createBill, args); },
  updateBill(...args) { return dispatch(mock.updateBill, cloud.updateBill, args); },
  deleteBill(...args) { return dispatch(mock.deleteBill, cloud.deleteBill, args); },
  previewSettlement(...args) { return dispatch(mock.previewSettlement, cloud.previewSettlement, args); },
  createSettlement(...args) { return dispatch(mock.createSettlement, cloud.createSettlement, args); },
  listSettlements(...args) { return dispatch(mock.listSettlements, cloud.listSettlements, args); },
  confirmSettlement(...args) { return dispatch(mock.confirmSettlement, cloud.confirmSettlement, args); },
  getPersonalReport(...args) { return dispatch(mock.getPersonalReport, cloud.getPersonalReport, args); },
  deletePersonalReport(...args) { return dispatch(mock.deletePersonalReport, cloud.deletePersonalReport, args); },
  endTrip(...args) { return dispatch(mock.endTrip, cloud.endTrip, args); }
};

// 页面只依赖这里的服务接口；Mock 和后续 Cloud 实现保持相同的调用边界。
const mock = require("./mock.js");
module.exports = {
  isDevelopment: () => true,
  bootstrapUser: mock.bootstrapUser, getMockState: mock.getMockState, listMockScenarios: mock.listMockScenarios,
  setMockScenario: mock.setMockScenario, resetMockData: mock.resetMockData, listTrips: mock.listTrips,
  createTrip: mock.createTrip, joinTrip: mock.joinTrip, getTrip: mock.getTrip, listMembers: mock.listMembers,
  updateTrip: () => ({ ok: true, code: "OK", data: null, error: null }), removeMember: mock.removeMember,
  getInvite: mock.getInvite, listBills: mock.listBills,
  getBill: mock.getBill, createBill: mock.createBill, updateBill: mock.updateBill,
  deleteBill: mock.deleteBill, previewSettlement: mock.previewSettlement,
  createSettlement: mock.createSettlement, listSettlements: mock.listSettlements,
  confirmSettlement: mock.confirmSettlement, getPersonalReport: mock.getPersonalReport,
  endTrip: mock.endTrip
};

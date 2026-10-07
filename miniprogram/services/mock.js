const logic = require("./logic.js");

const STORAGE_KEY = "同行小本.mockState";
const clone = (value) => JSON.parse(JSON.stringify(value));
const errorMessages = {
  INVALID_TRIP: "行程信息不完整", INVALID_DATE_RANGE: "结束日期不能早于开始日期", INVITE_NOT_FOUND: "邀请码无效或行程已结束",
  ALREADY_MEMBER: "你已经加入该行程", TRIP_ENDED: "行程已结束，不能加入新成员", TRIP_NOT_FOUND: "行程不存在",
  BILL_NOT_FOUND: "账单不存在", SETTLEMENT_NOT_FOUND: "结账记录不存在", FORBIDDEN: "你没有执行此操作的权限",
  MEMBER_NOT_FOUND: "成员不存在", MEMBER_REMOVED: "该成员已被移除", MEMBER_NOT_SETTLED: "该成员还有未结清的应收或应付", INVALID_BILL: "账单信息不完整或不合法",
  INVALID_NAME: "请填写消费名称", INVALID_AMOUNT: "金额必须是合法的两位小数", INVALID_SHARES: "分摊金额合计必须等于账单总额",
  INVALID_USAGE_DATES: "实际使用日期必须在行程范围内", INVALID_USAGE_RANGE: "结束日期必须晚于开始日期", BILL_LOCKED: "账单已进入结账快照，不能修改",
  VERSION_CONFLICT: "账单已被其他操作更新，请刷新后重试", NO_SETTLEMENT: "当前没有公共账单或待结算欠款，无需结账，可以直接结束行程",
  REPORT_NOT_READY: "行程结束后才能查看正式报告", REPORT_DELETED: "当前用户的历史报告已删除", TRIP_NOT_READY: "还有未结账或未确认的公共账单"
};
const result = (data, code = "OK", message) => ({ ok: code === "OK", code, data: clone(data), error: code === "OK" ? null : { code, message: message || errorMessages[code] || "Mock 数据操作失败" } });
const operationError = (code) => result(null, code);

const baseTrips = {
  active: { id: "trip-forest", name: "森林周末", startDate: "2026-10-02", endDate: "2026-10-05", dateText: "10月2日 – 10月5日", inviteCode: "0421", lastOperatedAt: 20 },
  ended: { id: "trip-mountain", name: "山城三日", startDate: "2026-06-01", endDate: "2026-06-03", dateText: "6月1日 – 6月3日", inviteCode: "0631", lastOperatedAt: 10, status: "ended" }
};
const roleLabels = { new: "新用户", owner: "房主", member: "普通成员", removed: "已移除成员" };
const scenarios = {
  "new-user": { label: "新用户 · 没有行程", role: "new", active: [], ended: [] },
  "active-only": { label: "进行中 · 只有进行中行程", role: "owner", active: [baseTrips.active], ended: [] },
  "ended-only": { label: "已结束 · 只有已结束行程", role: "member", active: [], ended: [baseTrips.ended] },
  "member-active": { label: "进行中 · 普通成员", role: "member", active: [baseTrips.active], ended: [] },
  "active-ended": { label: "老用户 · 进行中和已结束", role: "owner", active: [baseTrips.active], ended: [baseTrips.ended] },
  removed: { label: "已移除成员 · 保留历史", role: "removed", active: [baseTrips.active], ended: [] }
};
const homeScenarioIds = ["new-user", "active-only", "ended-only", "active-ended"];
let state = null;
let loadedScenarioId = null;
let nextTripNumber = 1;
let nextBillNumber = 1;
let nextSettlementNumber = 1;

function formatDateText(startDate, endDate) { return startDate.slice(5).replace("-", "月") + "日 – " + endDate.slice(5).replace("-", "月") + "日"; }
function formatBalanceLabel(balanceCents) { return balanceCents > 0 ? "这趟有人要还我" : balanceCents < 0 ? "这趟我还要补上" : "这趟刚刚好"; }
function formatTrip(trip) {
  const item = clone(trip); const balanceCents = Number(item.balanceCents || 0); item.dateText = item.dateText || formatDateText(item.startDate, item.endDate); item.memberText = (item.members || []).length + "人"; item.status = item.status === "ended" || item.ended ? "已结束" : "进行中"; item.balanceLabel = formatBalanceLabel(balanceCents); item.balanceText = logic.formatCents(Math.abs(balanceCents)); return item;
}
function makeMembers(role, ended) {
  if (role === "new") return [{ id: "user-me", name: "我", role: "owner", status: "active" }];
  if (role === "removed") return [{ id: "user-me", name: "我", role: "member", status: "removed" }, { id: "user-amy", name: "小安", role: "owner", status: "active" }, { id: "user-lin", name: "小林", role: "member", status: "active" }];
  if (ended) return [{ id: "user-me", name: "我", role: "member", status: "active" }, { id: "user-amy", name: "小安", role: "owner", status: "active" }, { id: "user-lin", name: "小林", role: "member", status: "active" }];
  return [{ id: "user-me", name: "我", role, status: "active" }, { id: "user-amy", name: "小安", role: role === "owner" ? "member" : "owner", status: "active" }, { id: "user-lin", name: "小林", role: "member", status: "active" }];
}
function makeBill(id, tripId, overrides) {
  const base = { id, tripId, name: "森林晚餐", totalCents: 8600, category: "餐饮", payerId: "user-me", paymentDate: "2026-10-03", timingType: "normal", usageDateMode: "single", usageStartDate: "2026-10-03", usageEndDate: "2026-10-03", privacy: "public", splitMode: "even", shares: { "user-me": 2866, "user-amy": 2867, "user-lin": 2867 }, location: "林间餐厅", createdBy: "user-me", version: 1, stage: 1, locked: false };
  const bill = { ...base, ...overrides }; bill.amountText = logic.formatCents(bill.totalCents); return bill;
}
function makeInitialBills(trips) {
  if (!trips.some((trip) => trip.id === "trip-forest")) return [];
  return [
    makeBill("bill-dinner", "trip-forest", { name: "森林晚餐", totalCents: 8600, category: "餐饮", shares: { "user-me": 2866, "user-amy": 2867, "user-lin": 2867 }, location: "林间餐厅" }),
    makeBill("bill-ticket", "trip-forest", { name: "往返车票", totalCents: 5250, category: "交通", payerId: "user-amy", paymentDate: "2026-10-02", usageStartDate: "2026-10-02", usageEndDate: "2026-10-02", shares: { "user-me": 1750, "user-amy": 1750, "user-lin": 1750 }, location: "森林车站" }),
    makeBill("bill-private", "trip-forest", { name: "个人咖啡", totalCents: 1800, category: "餐饮", payerId: "user-me", privacy: "private", splitMode: "custom", shares: { "user-me": 1800 }, location: "山脚咖啡馆" })
  ];
}
function buildState(scenarioId) {
  const scenario = scenarios[scenarioId] || scenarios["active-ended"];
  const activeTrips = scenario.active.map((trip) => formatTrip({ ...trip, currentStage: 1, ownerId: scenario.role === "member" || scenario.role === "removed" ? "user-amy" : "user-me", members: makeMembers(scenario.role, false) }));
  const endedTrips = scenario.ended.map((trip) => formatTrip({ ...trip, ended: true, currentStage: 1, ownerId: "user-amy", members: makeMembers(scenario.role, true) }));
  const trips = [...activeTrips, ...endedTrips];
  return { scenarioId: scenarios[scenarioId] ? scenarioId : "active-ended", scenarioLabel: scenario.label, role: scenario.role, roleLabel: roleLabels[scenario.role], currentUserId: "user-me", trips, activeTrips, endedTrips, bills: makeInitialBills(trips), settlements: [], reports: {}, deletedReports: [], members: activeTrips[0] ? activeTrips[0].members : endedTrips[0] ? endedTrips[0].members : makeMembers(scenario.role, false) };
}
function readState() {
  const saved = typeof wx === "undefined" ? (loadedScenarioId || "active-ended") : wx.getStorageSync(STORAGE_KEY) || "active-ended";
  if (!state || loadedScenarioId !== saved) { state = buildState(saved); loadedScenarioId = state.scenarioId; }
  return state;
}
function saveScenario(scenarioId) {
  state = buildState(scenarioId); loadedScenarioId = state.scenarioId; if (typeof wx !== "undefined") wx.setStorageSync(STORAGE_KEY, scenarioId); return result(state);
}
function getTripById(id) { return readState().trips.find((trip) => trip.id === id) || null; }
function getMembers(trip) { return trip && trip.members ? trip.members : []; }
function getMember(trip, memberId) { return getMembers(trip).find((member) => member.id === memberId) || null; }
function reportKey(tripId, userId) { return String(userId) + ":" + String(tripId); }
function hasDeletedReport(tripId) { const current = readState(); return (current.deletedReports || []).some((item) => item.tripId === tripId && item.userId === current.currentUserId); }
function isActiveMember(trip, memberId) { const member = getMember(trip, memberId); return !!member && member.status === "active"; }
function visibleBill(bill, userId) { return bill.privacy === "private" ? bill.payerId === userId : bill.createdBy === userId || bill.payerId === userId || Object.prototype.hasOwnProperty.call(bill.shares || {}, userId); }
function billForPage(bill) { const item = clone(bill); item.amountText = logic.formatCents(item.totalCents); item.shareText = logic.formatCents((item.shares || {})[readState().currentUserId] || 0); item.lockedText = item.locked ? "已结账锁定" : "可编辑"; item.canEdit = !item.locked && item.createdBy === readState().currentUserId; return item; }
function generateInviteCode() { const used = new Set(readState().activeTrips.map((trip) => trip.inviteCode)); for (let number = 0; number < 10000; number += 1) { const candidate = String((number + nextTripNumber * 137) % 10000).padStart(4, "0"); if (!used.has(candidate)) return candidate; } return null; }
function makeTripBalance(trip) { const bills = readState().bills.filter((bill) => bill.tripId === trip.id && bill.stage === trip.currentStage && !bill.locked && bill.privacy === "public"); const balances = logic.calculateBalances(bills, trip.members); return balances[readState().currentUserId] || 0; }
function decorateTrips() { const current = readState(); current.trips.forEach((trip) => { trip.balanceCents = makeTripBalance(trip); Object.assign(trip, formatTrip(trip)); }); current.activeTrips = current.trips.filter((trip) => trip.status === "进行中"); current.endedTrips = current.trips.filter((trip) => trip.status === "已结束" && !hasDeletedReport(trip.id)); }
function validateBillInput(input, trip, existing) {
  const name = String(input.name || (existing && existing.name) || "").trim(); const totalCents = input.amount != null ? logic.parseAmountToCents(input.amount) : (input.totalCents != null ? Number(input.totalCents) : logic.parseAmountToCents(existing && existing.totalCents)); const category = String(input.category || (existing && existing.category) || "其他"); const privacy = input.privacy || (existing && existing.privacy) || "public"; const payerId = input.payerId || (existing && existing.payerId) || readState().currentUserId; const memberIds = Array.from(new Set(input.memberIds || (existing && Object.keys(existing.shares || {})) || [readState().currentUserId])); const splitMode = input.splitMode || (existing && existing.splitMode) || "even"; const paymentDate = input.paymentDate || (existing && existing.paymentDate) || ""; const usageDateMode = input.usageDateMode || (existing && existing.usageDateMode) || "single"; const usageStartDate = input.usageStartDate || (existing && existing.usageStartDate) || paymentDate; const usageEndDate = input.usageEndDate || (existing && existing.usageEndDate) || usageStartDate;
  if (!name) return operationError("INVALID_NAME"); if (!Number.isSafeInteger(totalCents) || totalCents <= 0) return operationError("INVALID_AMOUNT"); if (!logic.isDateString(paymentDate)) return operationError("INVALID_BILL"); if (!isActiveMember(trip, payerId) || memberIds.some((id) => !isActiveMember(trip, id))) return operationError("FORBIDDEN"); const timingType = logic.classifyTiming(paymentDate, trip.startDate, trip.endDate); if (usageDateMode !== "single" && usageEndDate <= usageStartDate) return operationError("INVALID_USAGE_RANGE"); const usageDates = logic.getUsageDates({ usageDateMode, usageStartDate, usageEndDate, tripStartDate: trip.startDate, tripEndDate: trip.endDate }); if (!usageDates || !usageDates.length) return operationError("INVALID_USAGE_DATES");
  const actualMemberIds = privacy === "private" ? [readState().currentUserId] : memberIds; const actualPayerId = privacy === "private" ? readState().currentUserId : payerId; const actualMode = privacy === "private" ? "custom" : splitMode; let customShares = input.customShares || (existing && existing.shares); if (input.customSharesYuan) { customShares = {}; Object.keys(input.customSharesYuan).forEach((id) => { customShares[id] = logic.parseAmountToCents(input.customSharesYuan[id]); }); } const shares = privacy === "private" ? { [readState().currentUserId]: totalCents } : logic.buildShares({ totalCents, splitMode: actualMode, memberIds: actualMemberIds, payerId: actualPayerId, customShares }); if (!shares || logic.sum(Object.values(shares)) !== totalCents) return operationError("INVALID_SHARES");
  return result({ name, totalCents, category, privacy, payerId: actualPayerId, memberIds: actualMemberIds, splitMode: actualMode, shares, paymentDate, timingType, usageDateMode, usageStartDate, usageEndDate, location: String(input.location || (existing && existing.location) || "").trim() });
}
function listBillsForTrip(tripId) { return readState().bills.filter((bill) => (!tripId || bill.tripId === tripId) && visibleBill(bill, readState().currentUserId)).map(billForPage); }
function currentStageBills(trip) { return readState().bills.filter((bill) => bill.tripId === trip.id && bill.stage === trip.currentStage && !bill.locked && bill.privacy === "public"); }
function memberHasUnsettledBalance(trip, memberId) {
  const current = readState();
  const memberSettlements = current.settlements.filter((settlement) => settlement.tripId === trip.id && settlement.memberIds.includes(memberId));
  if (memberSettlements.some((settlement) => settlement.status !== "complete")) return true;
  const settledBillIds = new Set(memberSettlements.filter((settlement) => settlement.status === "complete").reduce((ids, settlement) => ids.concat(settlement.billIds || []), []));
  const openBills = current.bills.filter((bill) => bill.tripId === trip.id && bill.privacy === "public" && !settledBillIds.has(bill.id) && (bill.payerId === memberId || Object.prototype.hasOwnProperty.call(bill.shares || {}, memberId)));
  const balances = logic.calculateBalances(openBills, trip.members);
  return (balances[memberId] || 0) !== 0;
}

module.exports = {
  getMockState() { decorateTrips(); return result(readState()); },
  listMockScenarios() { return result(homeScenarioIds.map((id) => ({ id, label: scenarios[id].label }))); },
  setMockScenario(scenarioId) { return scenarios[scenarioId] ? saveScenario(scenarioId) : result(null, "MOCK_SCENARIO_NOT_FOUND"); },
  resetMockData() { return saveScenario("active-ended"); },
  bootstrapUser() { const current = readState(); return result({ id: current.currentUserId, name: "我", subtitle: "前端演示账号", role: current.role, roleLabel: current.roleLabel }); },
  listTrips() { decorateTrips(); const current = readState(); return result(current.trips.filter((trip) => trip.status !== "已结束" || !hasDeletedReport(trip.id)).map(formatTrip)); },
  getTrip(id) { decorateTrips(); const current = readState(); const trip = current.trips.find((item) => item.id === id) || current.activeTrips[0] || current.endedTrips[0] || null; return result(trip ? { ...formatTrip(trip), members: clone(getMembers(trip)), bills: listBillsForTrip(trip.id) } : null); },
  listMembers(tripId) { const trip = getTripById(tripId); return result(trip ? getMembers(trip) : readState().members); },
  getInvite(tripId) { const trip = getTripById(tripId); return trip && trip.status === "进行中" ? result({ tripId: trip.id, code: trip.inviteCode }) : operationError("TRIP_ENDED"); },
  createTrip(input = {}) { const name = String(input.name || "").trim(); const startDate = String(input.startDate || ""); const endDate = String(input.endDate || ""); if (!name || !logic.isDateString(startDate) || !logic.isDateString(endDate)) return operationError("INVALID_TRIP"); if (logic.compareDates(startDate, endDate) > 0) return operationError("INVALID_DATE_RANGE"); const current = readState(); const trip = formatTrip({ id: "trip-new-" + nextTripNumber, name, startDate, endDate, inviteCode: generateInviteCode(), currentStage: 1, ownerId: current.currentUserId, members: [{ id: current.currentUserId, name: "我", role: "owner", status: "active" }], lastOperatedAt: Date.now() }); nextTripNumber += 1; current.role = "owner"; current.roleLabel = roleLabels.owner; current.trips.unshift(trip); current.activeTrips.unshift(trip); current.members = trip.members; return result(trip); },
  joinTrip(input = {}) { const code = String(input.inviteCode || "").trim(); const current = readState(); const trip = current.activeTrips.find((item) => item.inviteCode === code); if (!trip) return operationError("INVITE_NOT_FOUND"); const member = getMember(trip, current.currentUserId); if (member && member.status === "active") return operationError("ALREADY_MEMBER"); if (member && member.status === "removed") return operationError("MEMBER_REMOVED"); trip.members.push({ id: current.currentUserId, name: "我", role: "member", status: "active" }); trip.memberText = trip.members.length + "人"; current.members = trip.members; return result(formatTrip(trip)); },
  removeMember(tripId, memberId) { const current = readState(); const trip = getTripById(tripId); if (!trip) return operationError("TRIP_NOT_FOUND"); if (trip.ownerId !== current.currentUserId || current.role !== "owner") return operationError("FORBIDDEN"); const member = getMember(trip, memberId); if (!member || member.role === "owner") return operationError("FORBIDDEN"); if (memberHasUnsettledBalance(trip, memberId)) return operationError("MEMBER_NOT_SETTLED"); member.status = "removed"; return result(member); },
  listBills(tripId) { return result(listBillsForTrip(tripId)); },
  getBill(billId) { const bill = readState().bills.find((item) => item.id === billId); return bill && visibleBill(bill, readState().currentUserId) ? result(billForPage(bill)) : operationError("BILL_NOT_FOUND"); },
  createBill(input = {}) { const trip = getTripById(input.tripId); const current = readState(); if (!trip) return operationError("TRIP_NOT_FOUND"); if (trip.status !== "进行中") return operationError("TRIP_ENDED"); if (!isActiveMember(trip, current.currentUserId)) return operationError("MEMBER_REMOVED"); const checked = validateBillInput(input, trip); if (!checked.ok) return checked; const bill = { id: "bill-new-" + nextBillNumber, tripId: trip.id, createdBy: current.currentUserId, version: 1, stage: trip.currentStage, locked: false, ...checked.data }; nextBillNumber += 1; current.bills.push(bill); decorateTrips(); return result(billForPage(bill)); },
  updateBill(billId, input = {}) { const current = readState(); const bill = current.bills.find((item) => item.id === billId); if (!bill) return operationError("BILL_NOT_FOUND"); const trip = getTripById(bill.tripId); if (!isActiveMember(trip, current.currentUserId)) return operationError("MEMBER_REMOVED"); if (!visibleBill(bill, current.currentUserId) || bill.createdBy !== current.currentUserId) return operationError("FORBIDDEN"); if (bill.locked) return operationError("BILL_LOCKED"); if (Number(input.expectedVersion) !== bill.version) return operationError("VERSION_CONFLICT"); const checked = validateBillInput({ ...bill, ...input }, trip, bill); if (!checked.ok) return checked; Object.assign(bill, checked.data, { version: bill.version + 1 }); return result(billForPage(bill)); },
  deleteBill(billId) { const current = readState(); const index = current.bills.findIndex((item) => item.id === billId); if (index < 0) return operationError("BILL_NOT_FOUND"); const bill = current.bills[index]; const trip = getTripById(bill.tripId); if (!isActiveMember(trip, current.currentUserId)) return operationError("MEMBER_REMOVED"); if (bill.createdBy !== current.currentUserId) return operationError("FORBIDDEN"); if (bill.locked) return operationError("BILL_LOCKED"); current.bills.splice(index, 1); return result({ id: billId }); },
  previewSettlement(tripId) { const trip = getTripById(tripId) || readState().activeTrips[0]; if (!trip) return operationError("TRIP_NOT_FOUND"); const current = readState(); const bills = currentStageBills(trip); const balances = logic.calculateBalances(bills, trip.members); const netBalance = balances[current.currentUserId] || 0; const allTransfers = logic.buildTransfers(balances); if (!allTransfers.length) return operationError("NO_SETTLEMENT"); const transfers = allTransfers.filter((transfer) => transfer.fromId === current.currentUserId || transfer.toId === current.currentUserId).map((transfer, index) => ({ ...transfer, id: "preview-" + index, amountText: logic.formatCents(transfer.amount), fromName: (getMember(trip, transfer.fromId) || {}).name || "同行成员", toName: (getMember(trip, transfer.toId) || {}).name || "同行成员" })); return result({ tripId: trip.id, stage: trip.currentStage, balances, balanceCents: netBalance, balanceLabel: formatBalanceLabel(netBalance), balanceText: logic.formatCents(Math.abs(netBalance)), transfers, billIds: bills.map((bill) => bill.id) }); },
  createSettlement(tripId) { const current = readState(); const trip = getTripById(tripId) || current.activeTrips[0]; if (!trip) return operationError("TRIP_NOT_FOUND"); if (trip.status !== "进行中") return operationError("TRIP_ENDED"); if (!isActiveMember(trip, current.currentUserId)) return operationError("MEMBER_REMOVED"); const bills = currentStageBills(trip); if (!bills.length) return operationError("NO_SETTLEMENT"); const balances = logic.calculateBalances(bills, trip.members); const transfers = logic.buildTransfers(balances).map((transfer, index) => ({ ...transfer, id: "transfer-" + nextSettlementNumber + "-" + index, confirmed: false })); if (!transfers.length) return operationError("NO_SETTLEMENT"); const memberIds = Array.from(new Set(transfers.reduce((ids, transfer) => ids.concat([transfer.fromId, transfer.toId]), []))); const settlement = { id: "settlement-" + nextSettlementNumber, tripId: trip.id, stage: trip.currentStage, billIds: bills.map((bill) => bill.id), balances, transfers, memberIds, confirmations: {}, status: "pending" }; nextSettlementNumber += 1; memberIds.forEach((id) => { settlement.confirmations[id] = false; }); bills.forEach((bill) => { bill.locked = true; }); current.settlements.push(settlement); trip.currentStage += 1; return result(settlement); },
  listSettlements(tripId) { const current = readState(); const trip = getTripById(tripId); return result(current.settlements.filter((item) => (!tripId || item.tripId === tripId) && item.memberIds.includes(current.currentUserId)).map((item) => ({ ...item, currentConfirmed: !!item.confirmations[current.currentUserId], transfers: item.transfers.filter((transfer) => transfer.fromId === current.currentUserId || transfer.toId === current.currentUserId).map((transfer) => ({ ...transfer, amountText: logic.formatCents(transfer.amount), fromName: (getMember(trip, transfer.fromId) || {}).name || "同行成员", toName: (getMember(trip, transfer.toId) || {}).name || "同行成员" })) }))); },
  confirmSettlement(settlementId, memberId) { const current = readState(); const settlement = current.settlements.find((item) => item.id === settlementId); if (!settlement) return operationError("SETTLEMENT_NOT_FOUND"); const confirmer = memberId || current.currentUserId; if (!settlement.memberIds.includes(confirmer)) return operationError("FORBIDDEN"); settlement.confirmations[confirmer] = true; settlement.transfers.forEach((transfer) => { if (transfer.toId === confirmer) transfer.confirmed = true; }); settlement.status = Object.values(settlement.confirmations).every(Boolean) ? "complete" : "pending"; return result(settlement); },
  endTrip(tripId) { const current = readState(); const trip = getTripById(tripId) || current.activeTrips[0]; if (!trip) return operationError("TRIP_NOT_FOUND"); if (trip.status === "已结束") return operationError("TRIP_ENDED"); if (trip.ownerId !== current.currentUserId) return operationError("FORBIDDEN"); const currentBills = currentStageBills(trip); const balances = logic.calculateBalances(currentBills, trip.members); if (logic.buildTransfers(balances).length || current.settlements.some((item) => item.tripId === trip.id && item.status !== "complete")) return operationError("TRIP_NOT_READY"); trip.status = "已结束"; trip.ended = true; trip.endedAt = new Date().toISOString(); decorateTrips(); return result(formatTrip(trip)); },
  getPersonalReport(tripId) { const current = readState(); const trip = getTripById(tripId) || current.endedTrips[0]; if (!trip || trip.status !== "已结束") return operationError("REPORT_NOT_READY"); if (hasDeletedReport(trip.id)) return operationError("REPORT_DELETED"); const key = reportKey(trip.id, current.currentUserId); if (current.reports && current.reports[key]) return result(current.reports[key]); const bills = current.bills.filter((bill) => bill.tripId === trip.id && visibleBill(bill, current.currentUserId)); const report = { ...logic.buildReport({ trip, bills, memberId: current.currentUserId }), title: trip.name + " · 我的报告", lead: "旅程结束后，每位同行人只会看到属于自己的回忆与花销。", canDelete: true }; current.reports = current.reports || {}; current.reports[key] = report; return result(report); },
  deletePersonalReport(tripId) { const current = readState(); const trip = getTripById(tripId); if (!trip) return operationError("TRIP_NOT_FOUND"); if (trip.status !== "已结束") return operationError("REPORT_NOT_READY"); if (!getMember(trip, current.currentUserId)) return operationError("FORBIDDEN"); current.deletedReports = current.deletedReports || []; if (!hasDeletedReport(trip.id)) current.deletedReports.push({ tripId: trip.id, userId: current.currentUserId }); if (current.reports) delete current.reports[reportKey(trip.id, current.currentUserId)]; decorateTrips(); return result({ tripId: trip.id, deleted: true }); }
};

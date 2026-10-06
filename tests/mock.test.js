const test = require("node:test");
const assert = require("node:assert/strict");
const mock = require("../miniprogram/services/mock.js");

function ok(value) { assert.equal(value.ok, true, value.error && value.error.message); return value.data; }

test("首页 Mock 场景只有四种行程状态", () => {
  assert.deepEqual(ok(mock.listMockScenarios()).map((item) => item.id), ["new-user", "active-only", "ended-only", "active-ended"]);
});

test("账单权限、版本冲突和锁定状态", () => {
  ok(mock.resetMockData());
  const bills = ok(mock.listBills("trip-forest"));
  assert.equal(bills.length, 3);
  assert.equal(ok(mock.getTrip("trip-forest")).balanceLabel, "这趟有人要还我");
  const preview = ok(mock.previewSettlement("trip-forest"));
  assert.equal(preview.balanceLabel, "这趟有人要还我");
  assert.ok(preview.transfers.every((transfer) => transfer.fromId === "user-me" || transfer.toId === "user-me"));
  const privateBill = bills.find((bill) => bill.privacy === "private");
  assert.equal(ok(mock.getBill(privateBill.id)).privacy, "private");
  const created = ok(mock.createBill({ tripId: "trip-forest", name: "跨日车票", amount: "5.00", category: "交通", privacy: "public", splitMode: "even", payerId: "user-me", memberIds: ["user-me", "user-amy", "user-lin"], paymentDate: "2026-10-03", usageDateMode: "inclusive_range", usageStartDate: "2026-10-03", usageEndDate: "2026-10-04" }));
  assert.equal(created.totalCents, 500);
  const updated = ok(mock.updateBill(created.id, { expectedVersion: 1, name: "修改后的车票", amount: "6.00", tripId: "trip-forest", privacy: "public", splitMode: "even", payerId: "user-me", memberIds: ["user-me", "user-amy", "user-lin"], paymentDate: "2026-10-03", usageDateMode: "single", usageStartDate: "2026-10-03", usageEndDate: "2026-10-03" }));
  assert.equal(updated.version, 2);
  assert.equal(mock.updateBill(created.id, { ...updated, expectedVersion: 1 }).code, "VERSION_CONFLICT");
  const settlement = ok(mock.createSettlement("trip-forest"));
  const settlementView = ok(mock.listSettlements("trip-forest"))[0];
  assert.ok(settlementView.transfers.every((transfer) => transfer.fromId === "user-me" || transfer.toId === "user-me"));
  assert.ok(settlementView.transfers.every((transfer) => !transfer.fromName.startsWith("user-") && !transfer.toName.startsWith("user-")));
  assert.equal(mock.updateBill("bill-dinner", { expectedVersion: 1 }).code, "BILL_LOCKED");
  settlement.memberIds.forEach((memberId) => ok(mock.confirmSettlement(settlement.id, memberId)));
  assert.equal(ok(mock.listSettlements("trip-forest"))[0].status, "complete");
});

test("净余额方向变化时，摘要文案自动切换", () => {
  ok(mock.resetMockData());
  ok(mock.createBill({ tripId: "trip-forest", name: "小安代付住宿", amount: "100.00", category: "住宿", privacy: "public", splitMode: "custom", payerId: "user-amy", memberIds: ["user-me", "user-amy", "user-lin"], customShares: { "user-me": 10000, "user-amy": 0, "user-lin": 0 }, paymentDate: "2026-10-03", usageDateMode: "single", usageStartDate: "2026-10-03", usageEndDate: "2026-10-03" }));
  assert.equal(ok(mock.getTrip("trip-forest")).balanceLabel, "这趟我还要补上");
  assert.equal(ok(mock.previewSettlement("trip-forest")).balanceLabel, "这趟我还要补上");
});

test("多阶段结账、结束行程和个人报告", () => {
  ok(mock.resetMockData());
  const first = ok(mock.createSettlement("trip-forest"));
  first.memberIds.forEach((memberId) => ok(mock.confirmSettlement(first.id, memberId)));
  const nextBill = ok(mock.createBill({ tripId: "trip-forest", name: "第二阶段早餐", amount: "3.00", category: "餐饮", privacy: "public", splitMode: "treat", payerId: "user-me", memberIds: ["user-me", "user-amy", "user-lin"], paymentDate: "2026-10-04", usageDateMode: "single", usageStartDate: "2026-10-04", usageEndDate: "2026-10-04" }));
  assert.equal(nextBill.stage, 2);
  assert.equal(mock.endTrip("trip-forest").code, "TRIP_NOT_READY");
  const second = ok(mock.createSettlement("trip-forest"));
  second.memberIds.forEach((memberId) => ok(mock.confirmSettlement(second.id, memberId)));
  const ended = ok(mock.endTrip("trip-forest"));
  assert.equal(ended.status, "已结束");
  const report = ok(mock.getPersonalReport("trip-forest"));
  assert.equal(report.totalCents, report.daily.reduce((total, item) => total + item.amountCents, 0));
  assert.ok(report.daily.some((item) => item.amountCents === 0));
  assert.ok(report.locations.length <= report.summaries.length);
  assert.equal(mock.endTrip("trip-forest").code, "TRIP_ENDED");
});

test("成员有未结清应收或应付时不能移除", () => {
  ok(mock.resetMockData());
  assert.equal(mock.removeMember("trip-forest", "user-amy").code, "MEMBER_NOT_SETTLED");
  const settlement = ok(mock.createSettlement("trip-forest"));
  settlement.memberIds.forEach((memberId) => ok(mock.confirmSettlement(settlement.id, memberId)));
  assert.equal(ok(mock.removeMember("trip-forest", "user-amy")).status, "removed");
});

test("已移除成员不能新增账单", () => {
  ok(mock.setMockScenario("removed"));
  assert.equal(mock.createBill({ tripId: "trip-forest", name: "不应新增", amount: "1.00", paymentDate: "2026-10-03", usageStartDate: "2026-10-03", usageEndDate: "2026-10-03" }).code, "MEMBER_REMOVED");
  assert.equal(mock.getBill("bill-dinner").code, "OK");
  assert.equal(mock.updateBill("bill-dinner", { expectedVersion: 1 }).code, "MEMBER_REMOVED");
  assert.equal(mock.deleteBill("bill-dinner").code, "MEMBER_REMOVED");
});

test("预订、补记和自定义分摊遵循日期与合计校验", () => {
  ok(mock.resetMockData());
  const missingName = mock.createBill({ tripId: "trip-forest", name: "", amount: "120.12", paymentDate: "2026-10-03", usageDateMode: "single", usageStartDate: "2026-10-03", usageEndDate: "2026-10-03" });
  assert.equal(missingName.code, "INVALID_NAME");
  assert.equal(missingName.error.message, "请填写消费名称");
  const booking = ok(mock.createBill({ tripId: "trip-forest", name: "提前订票", amount: "10.00", category: "交通", privacy: "public", splitMode: "custom", payerId: "user-me", memberIds: ["user-me", "user-amy"], customShares: { "user-me": 400, "user-amy": 600 }, paymentDate: "2026-09-30", usageDateMode: "single", usageStartDate: "2026-10-02", usageEndDate: "2026-10-02" }));
  assert.equal(booking.timingType, "booking");
  assert.deepEqual(booking.shares, { "user-me": 400, "user-amy": 600 });
  assert.equal(mock.createBill({ tripId: "trip-forest", name: "金额不合计", amount: "10.00", category: "交通", privacy: "public", splitMode: "custom", payerId: "user-me", memberIds: ["user-me", "user-amy"], customShares: { "user-me": 400, "user-amy": 500 }, paymentDate: "2026-10-03", usageDateMode: "single", usageStartDate: "2026-10-03", usageEndDate: "2026-10-03" }).code, "INVALID_SHARES");
  assert.equal(mock.createBill({ tripId: "trip-forest", name: "错误提前订票", amount: "1.00", paymentDate: "2026-09-30", usageDateMode: "single", usageStartDate: "2026-09-30", usageEndDate: "2026-09-30" }).code, "INVALID_USAGE_DATES");
  assert.equal(mock.createBill({ tripId: "trip-forest", name: "同日跨日", amount: "1.00", paymentDate: "2026-10-03", usageDateMode: "inclusive_range", usageStartDate: "2026-10-03", usageEndDate: "2026-10-03" }).code, "INVALID_USAGE_RANGE");
  const late = ok(mock.createBill({ tripId: "trip-forest", name: "补记早餐", amount: "3.00", category: "餐饮", privacy: "public", splitMode: "treat", payerId: "user-me", memberIds: ["user-me", "user-amy"], paymentDate: "2026-10-06", usageDateMode: "single", usageStartDate: "2026-10-05", usageEndDate: "2026-10-05" }));
  assert.equal(late.timingType, "late_entry");
});

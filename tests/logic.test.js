const test = require("node:test");
const assert = require("node:assert/strict");
const logic = require("../miniprogram/services/logic.js");

test("金额解析和均摊使用整数分，并由付款人承担尾差", () => {
  assert.equal(logic.parseAmountToCents("86.5"), 8650);
  assert.equal(logic.parseAmountToCents("86.555"), null);
  assert.equal(logic.formatCents(8650), "¥86.50");
  assert.deepEqual(logic.splitEvenCents(8600, ["me", "amy", "lin"], "me"), { me: 2866, amy: 2867, lin: 2867 });
  assert.equal(logic.splitEvenCents(4, ["me", "amy", "lin"], "me"), null);
});

test("日期边界和跨日分币规则稳定", () => {
  assert.equal(logic.classifyTiming("2026-09-30", "2026-10-02", "2026-10-05"), "booking");
  assert.equal(logic.classifyTiming("2026-10-03", "2026-10-02", "2026-10-05"), "normal");
  assert.equal(logic.classifyTiming("2026-10-06", "2026-10-02", "2026-10-05"), "late_entry");
  assert.deepEqual(logic.getUsageDates({ usageDateMode: "night_range", usageStartDate: "2026-12-31", usageEndDate: "2027-01-02", tripStartDate: "2026-12-01", tripEndDate: "2027-01-03" }), ["2026-12-31", "2027-01-01"]);
  assert.equal(logic.getUsageDates({ usageDateMode: "inclusive_range", usageStartDate: "2026-10-03", usageEndDate: "2026-10-03", tripStartDate: "2026-10-02", tripEndDate: "2026-10-05" }), null);
  assert.deepEqual(logic.allocateAcrossDates(100, ["2026-10-02", "2026-10-03", "2026-10-04"]), { "2026-10-02": 34, "2026-10-03": 33, "2026-10-04": 33 });
  assert.deepEqual(logic.getUsageDates({ usageDateMode: "night_range", usageStartDate: "2026-10-02", usageEndDate: "2026-10-04", tripStartDate: "2026-10-01", tripEndDate: "2026-10-05" }), ["2026-10-02", "2026-10-03"]);
  assert.deepEqual(logic.getUsageDates({ usageDateMode: "inclusive_range", usageStartDate: "2026-10-02", usageEndDate: "2026-10-04", tripStartDate: "2026-10-01", tripEndDate: "2026-10-05" }), ["2026-10-02", "2026-10-03", "2026-10-04"]);
});

test("净余额和确定性欠款关系守恒", () => {
  const bills = [{ privacy: "public", payerId: "a", totalCents: 100, shares: { a: 33, b: 34, c: 33 } }];
  const balances = logic.calculateBalances(bills, [{ id: "a" }, { id: "b" }, { id: "c" }]);
  assert.deepEqual(balances, { a: 67, b: -34, c: -33 });
  assert.deepEqual(logic.buildTransfers(balances), [{ fromId: "b", toId: "a", amount: 34 }, { fromId: "c", toId: "a", amount: 33 }]);
  assert.equal(logic.sum(Object.values(balances)), 0);
});

test("报告按日拆分但总额不重复，地点去重", () => {
  const report = logic.buildReport({
    trip: { startDate: "2026-10-02", endDate: "2026-10-05" },
    memberId: "me",
    bills: [
      { id: "one", name: "住宿", category: "住宿", shares: { me: 100 }, usageDateMode: "night_range", usageStartDate: "2026-10-02", usageEndDate: "2026-10-04", location: "山顶" },
      { id: "two", name: "晚餐", category: "餐饮", shares: { me: 50 }, usageDateMode: "single", usageStartDate: "2026-10-03", usageEndDate: "2026-10-03", location: "山顶" }
    ]
  });
  assert.equal(report.totalCents, 150);
  assert.equal(report.daily.reduce((total, item) => total + item.amountCents, 0), 150);
  assert.deepEqual(report.daily.map((item) => item.amountCents), [50, 100, 0, 0]);
  assert.deepEqual(report.locations, [{ name: "山顶", date: "2026-10-02" }]);
});

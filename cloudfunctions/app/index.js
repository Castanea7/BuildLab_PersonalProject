const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ROLE_LABELS = { owner: "房主", member: "成员" };
const result = (data, code = "OK", message) => ({ ok: code === "OK", code, data: code === "OK" ? data : null, error: code === "OK" ? null : { code, message } });
const fail = (code, message) => result(null, code, message);

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateText(startDate, endDate) {
  return startDate.slice(5).replace("-", "月") + "日 – " + endDate.slice(5).replace("-", "月") + "日";
}

function timestampValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Number(value) || 0;
}

function formatBalance() {
  return { balanceCents: 0, balanceLabel: "这趟刚刚好", balanceText: "¥0.00" };
}

function toUserView(user) {
  return {
    id: user._id,
    name: user.name || "微信用户",
    subtitle: user.subtitle || "微信用户",
    role: user.role || "new",
    roleLabel: user.roleLabel || "新用户"
  };
}

async function currentIdentity(createIfMissing = true) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { error: fail("UNAUTHORIZED", "无法识别当前微信用户") };
  const existing = await db.collection("users").where({ _openid: OPENID }).limit(1).get();
  if (existing.data && existing.data.length) {
    const user = existing.data[0];
    await db.collection("users").doc(user._id).update({ data: { updatedAt: db.serverDate() } });
    return { openid: OPENID, user };
  }
  if (!createIfMissing) return { error: fail("UNAUTHORIZED", "当前微信用户尚未初始化") };
  const now = db.serverDate();
  const created = await db.collection("users").add({
    data: {
      _openid: OPENID,
      name: "微信用户",
      subtitle: "微信用户",
      role: "new",
      roleLabel: "新用户",
      avatarUrl: "",
      createdAt: now,
      updatedAt: now
    }
  });
  return { openid: OPENID, user: { _id: created._id, name: "微信用户", subtitle: "微信用户", role: "new", roleLabel: "新用户" } };
}

async function getTripDoc(tripId) {
  try {
    return (await db.collection("trips").doc(tripId).get()).data || null;
  } catch (error) {
    return null;
  }
}

async function getMembership(tripId, userId) {
  const response = await db.collection("trip_members").where({ tripId, userId }).limit(1).get();
  return response.data && response.data.length ? response.data[0] : null;
}

function formatBillCents(value) {
  return "¥" + (Number(value || 0) / 100).toFixed(2);
}

function buildBillShareMap(shares) {
  return (shares || []).reduce((map, share) => {
    if (share.userId) map[share.userId] = Number(share.amountCents || 0);
    return map;
  }, {});
}

function canViewBill(bill, shares, userId) {
  if (bill.privacy === "private") return bill.createdBy === userId || bill.payerId === userId;
  return bill.createdBy === userId || bill.payerId === userId || shares.some((share) => share.userId === userId);
}

function toBillView(bill, shares) {
  const shareMap = buildBillShareMap(shares);
  return {
    id: bill._id,
    tripId: bill.tripId,
    name: bill.name,
    totalCents: Number(bill.totalCents || 0),
    amountText: formatBillCents(bill.totalCents),
    category: bill.category,
    payerId: bill.payerId,
    paymentDate: bill.paymentDate,
    timingType: bill.timingType,
    usageDateMode: bill.usageDateMode,
    usageStartDate: bill.usageStartDate,
    usageEndDate: bill.usageEndDate,
    privacy: bill.privacy,
    splitMode: bill.splitMode,
    shares: shareMap,
    memberIds: Object.keys(shareMap),
    shareText: formatBillCents(shareMap[bill.currentUserId] || 0),
    canEdit: bill.locked !== true && bill.createdBy === bill.currentUserId,
    location: bill.location || "",
    createdBy: bill.createdBy,
    version: Number(bill.version || 1),
    stage: Number(bill.stage || 1),
    locked: bill.locked === true,
    lockedText: bill.locked === true ? "已结账锁定" : "可编辑",
    createdAt: bill.createdAt || null,
    updatedAt: bill.updatedAt || null
  };
}

async function getSharesForBills(tripId, billIds) {
  if (!billIds.length) return [];
  const response = await db.collection("bill_shares").where({ tripId }).get();
  const allowed = new Set(billIds);
  return (response.data || []).filter((share) => allowed.has(share.billId));
}

function parseAmountToCents(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  const text = String(value == null ? "" : value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function compareDates(left, right) {
  return new Date(left + "T00:00:00Z").getTime() - new Date(right + "T00:00:00Z").getTime();
}

function classifyTiming(paymentDate, tripStartDate, tripEndDate) {
  if (compareDates(paymentDate, tripStartDate) < 0) return "booking";
  if (compareDates(paymentDate, tripEndDate) > 0) return "late_entry";
  return "normal";
}

function getUsageDates(usageDateMode, usageStartDate, usageEndDate, trip) {
  const endDate = usageEndDate || usageStartDate;
  if (!isDateString(usageStartDate) || !isDateString(endDate)) return null;
  if (usageDateMode === "single" && usageStartDate !== endDate) return null;
  if (usageDateMode !== "single" && endDate <= usageStartDate) return null;
  if (usageStartDate < trip.startDate || endDate > trip.endDate) return null;
  if (usageDateMode !== "night_range") return [usageStartDate, endDate];
  return [usageStartDate];
}

function buildEvenShares(totalCents, memberIds, payerId) {
  if (!memberIds.length || !memberIds.includes(payerId) || totalCents < memberIds.length) return null;
  const shares = {};
  const otherAmount = Math.ceil(totalCents / memberIds.length);
  memberIds.forEach((id) => { if (id !== payerId) shares[id] = otherAmount; });
  shares[payerId] = totalCents - Object.keys(shares).filter((id) => id !== payerId).reduce((sum, id) => sum + shares[id], 0);
  if (Object.values(shares).some((amount) => amount < 1)) return null;
  return shares;
}

function buildCustomShares(input, memberIds, totalCents) {
  const source = input.customShares && typeof input.customShares === "object" ? input.customShares : {};
  const yuanSource = input.customSharesYuan && typeof input.customSharesYuan === "object" ? input.customSharesYuan : null;
  const shares = {};
  memberIds.forEach((id) => {
    const value = yuanSource ? parseAmountToCents(yuanSource[id]) : source[id];
    shares[id] = value;
  });
  if (Object.values(shares).some((amount) => !Number.isSafeInteger(amount) || amount < 0)) return null;
  if (Object.values(shares).reduce((sum, amount) => sum + amount, 0) !== totalCents) return null;
  return shares;
}

async function validateCreateBill(input, trip, userId) {
  const name = String(input.name || "").trim();
  if (!name) return fail("INVALID_NAME", "请填写消费名称");
  const totalCents = parseAmountToCents(input.amount);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) return fail("INVALID_AMOUNT", "金额必须是合法的两位小数");

  const paymentDate = String(input.paymentDate || "");
  if (!isDateString(paymentDate)) return fail("INVALID_BILL", "付款日期不合法");
  const usageDateMode = String(input.usageDateMode || "single");
  const usageStartDate = String(input.usageStartDate || paymentDate);
  const usageEndDate = String(input.usageEndDate || usageStartDate);
  if (usageDateMode !== "single" && usageEndDate <= usageStartDate) return fail("INVALID_USAGE_RANGE", "结束日期必须晚于开始日期");
  const usageDates = getUsageDates(usageDateMode, usageStartDate, usageEndDate, trip);
  const timingType = classifyTiming(paymentDate, trip.startDate, trip.endDate);
  if (!usageDates || !usageDates.length) {
    return fail("INVALID_USAGE_DATES", "实际使用日期必须在行程范围内");
  }

  const memberResponse = await db.collection("trip_members").where({ tripId: trip._id }).get();
  const memberships = memberResponse.data || [];
  const membershipMap = new Map(memberships.map((member) => [member.userId, member]));
  const isActiveMember = (memberId) => membershipMap.get(memberId)?.status === "active";
  const privacy = input.privacy || "public";
  if (!["public", "private"].includes(privacy)) return fail("INVALID_BILL", "账单类型不合法");

  let payerId = String(input.payerId || userId);
  let memberIds = Array.from(new Set(Array.isArray(input.memberIds) ? input.memberIds.map(String) : [userId]));
  let splitMode = String(input.splitMode || "even");
  let shares;
  if (privacy === "private") {
    payerId = userId;
    memberIds = [userId];
    splitMode = "custom";
    shares = { [userId]: totalCents };
  } else {
    if (!["even", "custom", "treat"].includes(splitMode) || !memberIds.length) return fail("INVALID_SHARES", "分摊金额合计必须等于账单总额");
    if (!isActiveMember(payerId) || memberIds.some((id) => !isActiveMember(id))) return fail("FORBIDDEN", "付款人和分摊成员必须属于当前行程");
    if (splitMode === "even") shares = buildEvenShares(totalCents, memberIds, payerId);
    else if (splitMode === "treat") shares = memberIds.includes(payerId) ? Object.fromEntries(memberIds.map((id) => [id, id === payerId ? totalCents : 0])) : null;
    else shares = buildCustomShares(input, memberIds, totalCents);
    if (!shares || Object.values(shares).reduce((sum, amount) => sum + amount, 0) !== totalCents) return fail("INVALID_SHARES", "分摊金额合计必须等于账单总额");
  }

  return {
    ok: true,
    data: {
      name,
      totalCents,
      category: String(input.category || "其他"),
      privacy,
      payerId,
      memberIds,
      splitMode,
      shares,
      paymentDate,
      timingType,
      usageDateMode,
      usageStartDate,
      usageEndDate,
      location: String(input.location || "").trim()
    }
  };
}

async function getMemberRows(tripId) {
  const memberships = await db.collection("trip_members").where({ tripId }).get();
  return Promise.all((memberships.data || []).map(async (membership) => {
    let user = null;
    try { user = (await db.collection("users").doc(membership.userId).get()).data; } catch (error) { user = null; }
    return {
      id: membership.userId,
      name: (user && user.name) || "微信用户",
      role: membership.role,
      roleLabel: ROLE_LABELS[membership.role] || "成员",
      status: membership.status || "active"
    };
  }));
}

function toTripView(trip, members, currentUserId) {
  const status = trip.status === "ended" ? "已结束" : "进行中";
  const currentMember = members.find((member) => member.id === currentUserId);
  const view = {
    id: trip._id,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    dateText: dateText(trip.startDate, trip.endDate),
    status,
    statusCode: trip.status,
    ownerId: trip.ownerId,
    lastOperatedAt: trip.lastOperatedAt || trip.updatedAt || trip.createdAt || null,
    currentStage: trip.currentStage || 1,
    members,
    memberText: members.length + "人",
    currentRole: currentMember ? currentMember.role : null,
    currentMemberStatus: currentMember ? currentMember.status : null,
    bills: [],
    ...formatBalance()
  };
  if (status === "进行中") view.inviteCode = trip.inviteCode;
  return view;
}

async function getTripView(trip, userId) {
  const members = await getMemberRows(trip._id);
  return toTripView(trip, members, userId);
}

async function bootstrapUser() {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  return result(toUserView(identity.user));
}

async function listTrips() {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const memberships = await db.collection("trip_members").where({ userId: identity.user._id }).get();
  let deletedReportTripIds = new Set();
  try {
    const deletedReports = await db.collection("personal_reports").where({ userId: identity.user._id, status: "deleted" }).get();
    deletedReportTripIds = new Set((deletedReports.data || []).map((report) => report.tripId));
  } catch (error) {
    deletedReportTripIds = new Set();
  }
  const trips = [];
  for (const membership of memberships.data || []) {
    const trip = await getTripDoc(membership.tripId);
    if (trip && !(trip.status === "ended" && deletedReportTripIds.has(trip._id))) trips.push(await getTripView(trip, identity.user._id));
  }
  trips.sort((left, right) => timestampValue(right.lastOperatedAt) - timestampValue(left.lastOperatedAt));
  return result(trips);
}

async function createTrip(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const name = String(input.name || "").trim();
  const startDate = String(input.startDate || "");
  const endDate = String(input.endDate || "");
  if (!name || !isDateString(startDate) || !isDateString(endDate)) return fail("INVALID_TRIP", "行程信息不完整");
  if (endDate < startDate) return fail("INVALID_DATE_RANGE", "结束日期不能早于开始日期");

  let inviteCode = null;
  for (let attempt = 0; attempt < 20 && !inviteCode; attempt += 1) {
    const candidate = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const found = await db.collection("trips").where({ inviteCode: candidate, status: "active" }).limit(1).get();
    if (!found.data || !found.data.length) inviteCode = candidate;
  }
  if (!inviteCode) return fail("INTERNAL_ERROR", "暂时无法生成唯一邀请码");

  const now = db.serverDate();
  const created = await db.collection("trips").add({
    data: {
      name, startDate, endDate, ownerId: identity.user._id, status: "active", inviteCode,
      currentStage: 1, createdAt: now, updatedAt: now, lastOperatedAt: now
    }
  });
  await db.collection("trip_members").add({
    data: { tripId: created._id, userId: identity.user._id, role: "owner", status: "active", joinedAt: now, updatedAt: now }
  });
  const trip = await getTripDoc(created._id);
  return result(await getTripView(trip, identity.user._id));
}

async function joinTrip(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const inviteCode = String(input.inviteCode || input.inviteToken || "").trim();
  const found = await db.collection("trips").where({ inviteCode, status: "active" }).limit(1).get();
  if (!found.data || !found.data.length) return fail("INVITE_NOT_FOUND", "邀请码无效或行程已结束");
  const trip = found.data[0];
  const existing = await getMembership(trip._id, identity.user._id);
  if (existing && existing.status === "active") return fail("ALREADY_MEMBER", "你已经加入该行程");
  if (existing && existing.status === "removed") return fail("MEMBER_REMOVED", "该成员已被移除");
  const now = db.serverDate();
  await db.collection("trip_members").add({
    data: { tripId: trip._id, userId: identity.user._id, role: "member", status: "active", joinedAt: now, updatedAt: now }
  });
  await db.collection("trips").doc(trip._id).update({ data: { updatedAt: now, lastOperatedAt: now } });
  return result(await getTripView(trip, identity.user._id));
}

async function getTrip(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = input.id ? await getTripDoc(input.id) : null;
  if (!trip) {
    const list = await listTrips();
    return list.ok && list.data.length ? result(list.data[0]) : fail("TRIP_NOT_FOUND", "行程不存在");
  }
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership) return fail("FORBIDDEN", "你不是该行程成员");
  return result(await getTripView(trip, identity.user._id));
}

async function listMembers(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership) return fail("FORBIDDEN", "你不是该行程成员");
  return result(await getMemberRows(trip._id));
}

async function updateTrip(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.id || input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status === "ended") return fail("TRIP_ENDED", "行程已结束，不能修改");
  if (trip.ownerId !== identity.user._id) return fail("FORBIDDEN", "你没有执行此操作的权限");
  const startDate = String(input.startDate || trip.startDate);
  const endDate = String(input.endDate || trip.endDate);
  if (!isDateString(startDate) || !isDateString(endDate)) return fail("INVALID_TRIP", "行程信息不完整");
  if (endDate < startDate) return fail("INVALID_DATE_RANGE", "结束日期不能早于开始日期");

  try {
    const bills = await db.collection("bills").where({ tripId: trip._id }).get();
    for (const bill of bills.data || []) {
      const usageStart = bill.usageStartDate || bill.paymentDate;
      const usageEnd = bill.usageEndDate || usageStart;
      if (usageStart < startDate || usageEnd > endDate) return fail("INVALID_DATE_RANGE", "新日期范围不能排除已有账单日期");
    }
  } catch (error) {
    // bills collection is introduced in the next Cloud slice; no bills means no conflict to check here.
  }

  await db.collection("trips").doc(trip._id).update({ data: { name: String(input.name || trip.name).trim(), startDate, endDate, updatedAt: db.serverDate(), lastOperatedAt: db.serverDate() } });
  return result(await getTripView(await getTripDoc(trip._id), identity.user._id));
}

async function removeMember(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status === "ended") return fail("TRIP_ENDED", "行程已结束，不能修改");
  if (trip.ownerId !== identity.user._id) return fail("FORBIDDEN", "你没有执行此操作的权限");
  const member = await getMembership(trip._id, input.memberId);
  if (!member || member.role === "owner") return fail("MEMBER_NOT_FOUND", "成员不存在");
  if (member.status === "removed") return result({ id: member.userId, status: "removed" });
  const now = db.serverDate();
  await db.collection("trip_members").doc(member._id).update({ data: { status: "removed", updatedAt: now } });
  await db.collection("trips").doc(trip._id).update({ data: { updatedAt: now, lastOperatedAt: now } });
  return result({ id: member.userId, status: "removed" });
}

async function getInvite(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status === "ended") return fail("TRIP_ENDED", "行程已结束，不能邀请新成员");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership || membership.status !== "active") return fail("FORBIDDEN", "你没有执行此操作的权限");
  return result({ tripId: trip._id, code: trip.inviteCode, sharePath: "/pages/join/index?inviteCode=" + encodeURIComponent(trip.inviteCode) });
}

async function listBills(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership) return fail("FORBIDDEN", "你不是该行程成员");

  const response = await db.collection("bills").where({ tripId: trip._id }).get();
  const bills = response.data || [];
  const shares = await getSharesForBills(trip._id, bills.map((bill) => bill._id));
  const sharesByBill = shares.reduce((map, share) => {
    (map[share.billId] || (map[share.billId] = [])).push(share);
    return map;
  }, {});
  return result(bills
    .filter((bill) => canViewBill(bill, sharesByBill[bill._id] || [], identity.user._id))
    .map((bill) => toBillView({ ...bill, currentUserId: identity.user._id }, sharesByBill[bill._id] || [])));
}

async function getBill(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const billId = input.id || input.billId;
  if (!billId) return fail("BILL_NOT_FOUND", "账单不存在");

  let bill;
  try { bill = (await db.collection("bills").doc(billId).get()).data; } catch (error) { bill = null; }
  if (!bill) return fail("BILL_NOT_FOUND", "账单不存在");
  const trip = await getTripDoc(bill.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership) return fail("FORBIDDEN", "你不是该行程成员");
  const shares = await getSharesForBills(trip._id, [bill._id]);
  const billShares = shares.filter((share) => share.billId === bill._id);
  if (!canViewBill(bill, billShares, identity.user._id)) return fail("BILL_NOT_FOUND", "账单不存在");
  return result(toBillView({ ...bill, currentUserId: identity.user._id }, billShares));
}

async function createBill(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status === "ended") return fail("TRIP_ENDED", "行程已结束，不能新增账单");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership || membership.status !== "active") return fail("MEMBER_REMOVED", "该成员已被移除");

  const checked = await validateCreateBill(input, trip, identity.user._id);
  if (!checked.ok) return checked;
  const now = db.serverDate();
  let created;
  let transaction;
  try {
    transaction = await db.startTransaction();
    created = await transaction.collection("bills").add({
      data: {
        tripId: trip._id,
        name: checked.data.name,
        totalCents: checked.data.totalCents,
        category: checked.data.category,
        payerId: checked.data.payerId,
        paymentDate: checked.data.paymentDate,
        timingType: checked.data.timingType,
        usageDateMode: checked.data.usageDateMode,
        usageStartDate: checked.data.usageStartDate,
        usageEndDate: checked.data.usageEndDate,
        privacy: checked.data.privacy,
        splitMode: checked.data.splitMode,
        memberIds: checked.data.memberIds,
        createdBy: identity.user._id,
        version: 1,
        stage: Number(trip.currentStage || 1),
        locked: false,
        location: checked.data.location,
        createdAt: now,
        updatedAt: now
      }
    });
    for (const [userId, amountCents] of Object.entries(checked.data.shares)) {
      await transaction.collection("bill_shares").add({
        data: { billId: created._id, tripId: trip._id, userId, amountCents, stage: Number(trip.currentStage || 1), createdAt: now, updatedAt: now }
      });
    }
    await transaction.collection("trips").doc(trip._id).update({ data: { updatedAt: now, lastOperatedAt: now } });
    await transaction.commit();
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (rollbackError) { /* preserve original failure */ }
    }
    return fail("INTERNAL_ERROR", "账单及分摊明细写入失败");
  }
  return getBill({ id: created._id });
}

function billInputForUpdate(input, bill, shares) {
  const shareMap = buildBillShareMap(shares);
  const merged = { ...bill, ...input, tripId: bill.tripId };
  if (!Object.prototype.hasOwnProperty.call(input, "amount")) merged.amount = (Number(bill.totalCents || 0) / 100).toFixed(2);
  if (!Object.prototype.hasOwnProperty.call(input, "memberIds")) merged.memberIds = Object.keys(shareMap);
  if (!Object.prototype.hasOwnProperty.call(input, "customShares") && !Object.prototype.hasOwnProperty.call(input, "customSharesYuan")) merged.customShares = shareMap;
  return merged;
}

async function rollbackTransaction(transaction, response) {
  try { await transaction.rollback(); } catch (error) { /* preserve the original response */ }
  return response;
}

async function loadBillForWrite(billId) {
  if (!billId) return null;
  try { return (await db.collection("bills").doc(billId).get()).data || null; } catch (error) { return null; }
}

async function updateBill(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const billId = input.id || input.billId;
  const original = await loadBillForWrite(billId);
  if (!original) return fail("BILL_NOT_FOUND", "账单不存在");
  const trip = await getTripDoc(original.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status === "ended") return fail("TRIP_ENDED", "行程已结束，不能修改账单");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership || membership.status !== "active") return fail("MEMBER_REMOVED", "该成员已被移除");
  if (original.createdBy !== identity.user._id) return fail("FORBIDDEN", "你没有修改此账单的权限");
  if (original.locked === true) return fail("BILL_LOCKED", "账单已锁定，不能修改");

  let transaction;
  try {
    transaction = await db.startTransaction();
    const current = (await transaction.collection("bills").doc(billId).get()).data;
    if (!current) return rollbackTransaction(transaction, fail("BILL_NOT_FOUND", "账单不存在"));
    if (Number(input.expectedVersion) !== Number(current.version || 1)) return rollbackTransaction(transaction, fail("VERSION_CONFLICT", "账单已被其他操作更新"));
    if (current.locked === true) return rollbackTransaction(transaction, fail("BILL_LOCKED", "账单已锁定，不能修改"));
    if (current.createdBy !== identity.user._id) return rollbackTransaction(transaction, fail("FORBIDDEN", "你没有修改此账单的权限"));
    const currentShares = (await transaction.collection("bill_shares").where({ billId }).get()).data || [];
    const checked = await validateCreateBill(billInputForUpdate(input, current, currentShares), trip, identity.user._id);
    if (!checked.ok) return rollbackTransaction(transaction, checked);
    const now = db.serverDate();
    await transaction.collection("bills").doc(billId).update({ data: {
      name: checked.data.name,
      totalCents: checked.data.totalCents,
      category: checked.data.category,
      payerId: checked.data.payerId,
      paymentDate: checked.data.paymentDate,
      timingType: checked.data.timingType,
      usageDateMode: checked.data.usageDateMode,
      usageStartDate: checked.data.usageStartDate,
      usageEndDate: checked.data.usageEndDate,
      privacy: checked.data.privacy,
      splitMode: checked.data.splitMode,
      memberIds: checked.data.memberIds,
      version: Number(current.version || 1) + 1,
      updatedAt: now,
      location: checked.data.location
    } });
    for (const share of currentShares) await transaction.collection("bill_shares").doc(share._id).remove();
    for (const [userId, amountCents] of Object.entries(checked.data.shares)) {
      await transaction.collection("bill_shares").add({ data: { billId, tripId: trip._id, userId, amountCents, stage: Number(current.stage || trip.currentStage || 1), createdAt: current.createdAt || now, updatedAt: now } });
    }
    await transaction.collection("trips").doc(trip._id).update({ data: { updatedAt: now, lastOperatedAt: now } });
    await transaction.commit();
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (rollbackError) { /* preserve original failure */ }
    }
    return fail("INTERNAL_ERROR", "账单及分摊明细更新失败");
  }
  return getBill({ id: billId });
}

async function deleteBill(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const billId = input.id || input.billId;
  const original = await loadBillForWrite(billId);
  if (!original) return fail("BILL_NOT_FOUND", "账单不存在");
  const trip = await getTripDoc(original.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status === "ended") return fail("TRIP_ENDED", "行程已结束，不能删除账单");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership || membership.status !== "active") return fail("MEMBER_REMOVED", "该成员已被移除");
  if (original.createdBy !== identity.user._id) return fail("FORBIDDEN", "你没有删除此账单的权限");
  if (original.locked === true) return fail("BILL_LOCKED", "账单已锁定，不能删除");

  let transaction;
  try {
    transaction = await db.startTransaction();
    const current = (await transaction.collection("bills").doc(billId).get()).data;
    if (!current) return rollbackTransaction(transaction, fail("BILL_NOT_FOUND", "账单不存在"));
    if (Number(input.expectedVersion) !== Number(current.version || 1)) return rollbackTransaction(transaction, fail("VERSION_CONFLICT", "账单已被其他操作更新"));
    if (current.locked === true) return rollbackTransaction(transaction, fail("BILL_LOCKED", "账单已锁定，不能删除"));
    if (current.createdBy !== identity.user._id) return rollbackTransaction(transaction, fail("FORBIDDEN", "你没有删除此账单的权限"));
    const shares = (await transaction.collection("bill_shares").where({ billId }).get()).data || [];
    for (const share of shares) await transaction.collection("bill_shares").doc(share._id).remove();
    await transaction.collection("bills").doc(billId).remove();
    const now = db.serverDate();
    await transaction.collection("trips").doc(trip._id).update({ data: { updatedAt: now, lastOperatedAt: now } });
    await transaction.commit();
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (rollbackError) { /* preserve original failure */ }
    }
    return fail("INTERNAL_ERROR", "账单及分摊明细删除失败");
  }
  return result({ id: billId });
}

function settlementBalanceLabel(balanceCents) {
  return balanceCents > 0 ? "这趟有人要还我" : balanceCents < 0 ? "这趟我还要补上" : "这趟刚刚好";
}

function buildSettlementTransfers(balances, stage) {
  const creditors = Object.keys(balances).filter((id) => balances[id] > 0).sort((left, right) => balances[right] - balances[left] || left.localeCompare(right)).map((id) => ({ id, amount: balances[id] }));
  const debtors = Object.keys(balances).filter((id) => balances[id] < 0).sort((left, right) => balances[left] - balances[right] || left.localeCompare(right)).map((id) => ({ id, amount: -balances[id] }));
  const transfers = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > 0) transfers.push({ id: "transfer-" + stage + "-" + transfers.length, fromId: debtor.id, toId: creditor.id, amount, confirmed: false });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditorIndex += 1;
    if (debtor.amount === 0) debtorIndex += 1;
  }
  return transfers;
}

function calculateSettlementData(bills, shares, members, stage) {
  const memberIds = (members || []).map((member) => member.id).sort();
  const balances = {};
  memberIds.forEach((id) => { balances[id] = 0; });
  const participants = new Set();
  const sharesByBill = (shares || []).reduce((map, share) => {
    (map[share.billId] || (map[share.billId] = [])).push(share);
    return map;
  }, {});
  for (const bill of bills) {
    const billShares = sharesByBill[bill._id] || [];
    const shareMap = buildBillShareMap(billShares);
    const shareTotal = Object.values(shareMap).reduce((sum, amount) => sum + amount, 0);
    if (!Number.isSafeInteger(Number(bill.totalCents)) || Number(bill.totalCents) <= 0 || shareTotal !== Number(bill.totalCents)) return { error: fail("INVALID_SETTLEMENT", "账单分摊数据不一致") };
    participants.add(bill.payerId);
    Object.keys(shareMap).forEach((userId) => participants.add(userId));
    balances[bill.payerId] = (balances[bill.payerId] || 0) + Number(bill.totalCents);
    Object.entries(shareMap).forEach(([userId, amount]) => { balances[userId] = (balances[userId] || 0) - amount; });
  }
  const balanceTotal = Object.values(balances).reduce((sum, amount) => sum + amount, 0);
  if (balanceTotal !== 0) return { error: fail("INVALID_SETTLEMENT", "清算金额不守恒") };
  const transfers = buildSettlementTransfers(balances, stage);
  const settlementMemberIds = Array.from(new Set(transfers.reduce((ids, transfer) => ids.concat([transfer.fromId, transfer.toId]), []))).sort();
  if (!settlementMemberIds.length) settlementMemberIds.push(...Array.from(participants).sort());
  const confirmations = Object.fromEntries(settlementMemberIds.map((id) => [id, false]));
  return { data: { balances, transfers, memberIds: settlementMemberIds, confirmations, billIds: bills.map((bill) => bill._id) } };
}

function formatSettlementView(snapshot, currentUserId, members) {
  const names = (members || []).reduce((map, member) => { map[member.id] = member.name || "微信用户"; return map; }, {});
  const balanceCents = Number((snapshot.balances || {})[currentUserId] || 0);
  return {
    id: snapshot._id,
    tripId: snapshot.tripId,
    stage: Number(snapshot.stage || 1),
    billIds: snapshot.billIds || [],
    balances: snapshot.balances || {},
    balanceCents,
    balanceLabel: settlementBalanceLabel(balanceCents),
    balanceText: formatBillCents(Math.abs(balanceCents)),
    transfers: (snapshot.transfers || []).filter((transfer) => transfer.fromId === currentUserId || transfer.toId === currentUserId).map((transfer) => ({ ...transfer, amountText: formatBillCents(transfer.amount), fromName: names[transfer.fromId] || "同行成员", toName: names[transfer.toId] || "同行成员" })),
    memberIds: snapshot.memberIds || [],
    confirmations: snapshot.confirmations || {},
    currentConfirmed: !!(snapshot.confirmations || {})[currentUserId],
    status: snapshot.status
  };
}

async function getCurrentStageSettlementData(trip, transaction) {
  const collection = transaction ? transaction.collection.bind(transaction) : db.collection.bind(db);
  const billsResponse = await collection("bills").where({ tripId: trip._id, stage: Number(trip.currentStage || 1) }).get();
  const bills = (billsResponse.data || []).filter((bill) => bill.privacy === "public" && bill.locked !== true);
  const sharesResponse = bills.length ? await collection("bill_shares").where({ tripId: trip._id }).get() : { data: [] };
  const billIds = new Set(bills.map((bill) => bill._id));
  const shares = (sharesResponse.data || []).filter((share) => billIds.has(share.billId));
  const members = await getMemberRows(trip._id);
  const calculated = calculateSettlementData(bills, shares, members, Number(trip.currentStage || 1));
  if (calculated.error) return calculated;
  return { data: { ...calculated.data, bills, shares, members } };
}

async function getSettlementSnapshot(snapshotId) {
  try { return (await db.collection("settlement_snapshots").doc(snapshotId).get()).data || null; } catch (error) { return null; }
}

async function previewSettlement(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership) return fail("FORBIDDEN", "你不是该行程成员");
  if (trip.status === "ended") return fail("TRIP_ENDED", "行程已结束，不能预览清算");
  const current = await getCurrentStageSettlementData(trip);
  if (current.error) return current.error;
  if (!current.data.bills.length || !current.data.transfers.length) return fail("NO_SETTLEMENT", "当前没有公共账单或待结算欠款，无需结账，可以直接结束行程");
  return result(formatSettlementView({ ...current.data, _id: "preview-" + trip.currentStage, tripId: trip._id, stage: trip.currentStage, status: "preview" }, identity.user._id, current.data.members));
}

async function createSettlement(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status === "ended") return fail("TRIP_ENDED", "行程已结束，不能结账");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership || membership.status !== "active") return fail("MEMBER_REMOVED", "该成员已被移除");

  let transaction;
  try {
    transaction = await db.startTransaction();
    const currentTrip = (await transaction.collection("trips").doc(trip._id).get()).data;
    if (!currentTrip || currentTrip.status === "ended") return rollbackTransaction(transaction, fail("TRIP_ENDED", "行程已结束，不能结账"));
    const stage = Number(currentTrip.currentStage || 1);
    const existing = await transaction.collection("settlement_snapshots").where({ tripId: trip._id, stage }).get();
    if (existing.data && existing.data.length) return rollbackTransaction(transaction, fail("SETTLEMENT_EXISTS", "当前阶段已经创建过结账快照"));
    const current = await getCurrentStageSettlementData(currentTrip, transaction);
    if (current.error) return rollbackTransaction(transaction, current.error);
    if (!current.data.bills.length || !current.data.transfers.length) return rollbackTransaction(transaction, fail("NO_SETTLEMENT", "当前没有公共账单或待结算欠款，无需结账，可以直接结束行程"));
    const now = db.serverDate();
    const created = await transaction.collection("settlement_snapshots").add({ data: {
      tripId: trip._id,
      stage,
      billIds: current.data.billIds,
      balances: current.data.balances,
      transfers: current.data.transfers,
      memberIds: current.data.memberIds,
      confirmations: current.data.confirmations,
      status: current.data.memberIds.length ? "pending" : "complete",
      createdBy: identity.user._id,
      createdAt: now,
      updatedAt: now
    } });
    for (const memberId of current.data.memberIds) {
      await transaction.collection("settlement_members").add({ data: { snapshotId: created._id, tripId: trip._id, stage, userId: memberId, confirmed: false, createdAt: now, updatedAt: now } });
    }
    for (const bill of current.data.bills) await transaction.collection("bills").doc(bill._id).update({ data: { locked: true, updatedAt: now } });
    await transaction.collection("trips").doc(trip._id).update({ data: { currentStage: stage + 1, updatedAt: now, lastOperatedAt: now } });
    await transaction.commit();
    return result(formatSettlementView({ ...current.data, _id: created._id, tripId: trip._id, stage, status: current.data.memberIds.length ? "pending" : "complete" }, identity.user._id, current.data.members));
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (rollbackError) { /* preserve original failure */ }
    }
    return fail("INTERNAL_ERROR", "创建结账快照失败");
  }
}

async function listSettlements(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership) return fail("FORBIDDEN", "你不是该行程成员");
  const memberRows = await db.collection("settlement_members").where({ tripId: trip._id, userId: identity.user._id }).get();
  const snapshotIds = new Set((memberRows.data || []).map((row) => row.snapshotId));
  const snapshots = await db.collection("settlement_snapshots").where({ tripId: trip._id }).get();
  const members = await getMemberRows(trip._id);
  return result((snapshots.data || []).filter((snapshot) => snapshotIds.has(snapshot._id)).sort((left, right) => Number(left.stage || 0) - Number(right.stage || 0)).map((snapshot) => formatSettlementView(snapshot, identity.user._id, members)));
}

async function confirmSettlement(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const snapshotId = input.id || input.snapshotId;
  if (!snapshotId) return fail("SETTLEMENT_NOT_FOUND", "结账记录不存在");
  const snapshot = await getSettlementSnapshot(snapshotId);
  if (!snapshot) return fail("SETTLEMENT_NOT_FOUND", "结账记录不存在");
  const trip = await getTripDoc(snapshot.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership) return fail("FORBIDDEN", "你不是该行程成员");
  if (!snapshot.memberIds.includes(identity.user._id)) return fail("FORBIDDEN", "你不在本次结账成员范围内");

  let transaction;
  try {
    transaction = await db.startTransaction();
    const current = (await transaction.collection("settlement_snapshots").doc(snapshotId).get()).data;
    if (!current) return rollbackTransaction(transaction, fail("SETTLEMENT_NOT_FOUND", "结账记录不存在"));
    const memberResponse = await transaction.collection("settlement_members").where({ snapshotId, userId: identity.user._id }).limit(1).get();
    if (!memberResponse.data || !memberResponse.data.length) return rollbackTransaction(transaction, fail("FORBIDDEN", "你不在本次结账成员范围内"));
    const member = memberResponse.data[0];
    if (current.status === "complete" || member.confirmed === true) return rollbackTransaction(transaction, result(formatSettlementView(current, identity.user._id, await getMemberRows(trip._id))));
    const confirmations = { ...(current.confirmations || {}), [identity.user._id]: true };
    const transfers = (current.transfers || []).map((transfer) => transfer.toId === identity.user._id ? { ...transfer, confirmed: true } : transfer);
    const complete = (current.memberIds || []).every((memberId) => confirmations[memberId] === true);
    const now = db.serverDate();
    await transaction.collection("settlement_members").doc(member._id).update({ data: { confirmed: true, updatedAt: now } });
    await transaction.collection("settlement_snapshots").doc(snapshotId).update({ data: { confirmations, transfers, status: complete ? "complete" : "pending", updatedAt: now } });
    await transaction.collection("trips").doc(trip._id).update({ data: { updatedAt: now, lastOperatedAt: now } });
    await transaction.commit();
    const updated = { ...current, confirmations, transfers, status: complete ? "complete" : "pending" };
    return result(formatSettlementView(updated, identity.user._id, await getMemberRows(trip._id)));
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (rollbackError) { /* preserve original failure */ }
    }
    return fail("INTERNAL_ERROR", "确认结账失败");
  }
}

async function endTrip(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status === "ended") return fail("TRIP_ENDED", "行程已经结束");
  if (trip.ownerId !== identity.user._id) return fail("FORBIDDEN", "只有房主可以结束行程");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership || membership.status !== "active") return fail("MEMBER_REMOVED", "该成员已被移除");

  let transaction;
  try {
    transaction = await db.startTransaction();
    const currentTrip = (await transaction.collection("trips").doc(trip._id).get()).data;
    if (!currentTrip) return rollbackTransaction(transaction, fail("TRIP_NOT_FOUND", "行程不存在"));
    if (currentTrip.status === "ended") return rollbackTransaction(transaction, fail("TRIP_ENDED", "行程已经结束"));
    if (currentTrip.ownerId !== identity.user._id) return rollbackTransaction(transaction, fail("FORBIDDEN", "只有房主可以结束行程"));
    const currentSettlement = await getCurrentStageSettlementData(currentTrip, transaction);
    if (currentSettlement.error) return rollbackTransaction(transaction, currentSettlement.error);
    if (currentSettlement.data.transfers.length) return rollbackTransaction(transaction, fail("TRIP_NOT_READY", "还有未结清的公共账单或欠款，完成结账后才能结束行程"));
    const snapshots = await transaction.collection("settlement_snapshots").where({ tripId: trip._id }).get();
    if ((snapshots.data || []).some((snapshot) => snapshot.status !== "complete")) return rollbackTransaction(transaction, fail("TRIP_NOT_READY", "还有成员未确认结账"));
    const now = db.serverDate();
    await transaction.collection("trips").doc(trip._id).update({ data: { status: "ended", endedAt: now, updatedAt: now, lastOperatedAt: now } });
    await transaction.commit();
    return result(await getTripView(await getTripDoc(trip._id), identity.user._id));
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (rollbackError) { /* preserve original failure */ }
    }
    return fail("INTERNAL_ERROR", "结束行程失败");
  }
}

function reportDateRange(startDate, endDate, includeEnd = true) {
  if (!isDateString(startDate) || !isDateString(endDate) || startDate > endDate) return [];
  const dates = [];
  let cursor = new Date(startDate + "T00:00:00Z").getTime();
  const end = new Date(endDate + "T00:00:00Z").getTime();
  while (cursor <= end && (includeEnd || cursor < end)) {
    const date = new Date(cursor);
    dates.push(date.toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return dates;
}

function reportUsageDates(bill, trip) {
  const start = bill.usageStartDate || bill.paymentDate;
  const end = bill.usageEndDate || start;
  if (bill.usageDateMode === "night_range") return reportDateRange(start, end, false);
  return reportDateRange(start, end, true);
}

function allocateReportAmount(amountCents, dates) {
  if (!dates.length) return {};
  const base = Math.floor(amountCents / dates.length);
  const remainder = amountCents % dates.length;
  return Object.fromEntries(dates.map((date, index) => [date, base + (index < remainder ? 1 : 0)]));
}

async function getPersonalReportRecord(tripId, userId) {
  try {
    const response = await db.collection("personal_reports").where({ tripId, userId }).limit(1).get();
    return response.data && response.data.length ? response.data[0] : null;
  } catch (error) {
    return null;
  }
}

async function getPersonalReport(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status !== "ended") return fail("REPORT_NOT_READY", "行程结束后才能查看正式报告");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership) return fail("FORBIDDEN", "你不是该行程成员");
  const existingReport = await getPersonalReportRecord(trip._id, identity.user._id);
  if (existingReport && existingReport.status === "deleted") return fail("REPORT_DELETED", "当前用户的历史报告已删除");
  if (existingReport && existingReport.status === "active" && existingReport.report) return result(existingReport.report);
  const billsResponse = await db.collection("bills").where({ tripId: trip._id }).get();
  const bills = billsResponse.data || [];
  const sharesResponse = bills.length ? await db.collection("bill_shares").where({ tripId: trip._id }).get() : { data: [] };
  const sharesByBill = (sharesResponse.data || []).reduce((map, share) => {
    (map[share.billId] || (map[share.billId] = [])).push(share);
    return map;
  }, {});
  const days = reportDateRange(trip.startDate, trip.endDate, true);
  const daily = Object.fromEntries(days.map((date) => [date, 0]));
  const categories = {};
  const locations = {};
  const summaries = [];
  let totalCents = 0;
  for (const bill of bills) {
    const personalShare = (sharesByBill[bill._id] || []).find((share) => share.userId === identity.user._id);
    if (!personalShare) continue;
    const amountCents = Number(personalShare.amountCents || 0);
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) return fail("INVALID_REPORT_DATA", "账单分摊数据不合法");
    totalCents += amountCents;
    const category = bill.category || "其他";
    categories[category] = (categories[category] || 0) + amountCents;
    const usageDates = reportUsageDates(bill, trip);
    const allocation = allocateReportAmount(amountCents, usageDates);
    Object.entries(allocation).forEach(([date, value]) => { if (Object.prototype.hasOwnProperty.call(daily, date)) daily[date] += value; });
    const location = String(bill.location || "").trim();
    if (location && (!locations[location] || String(locations[location].date) > String(usageDates[0] || bill.usageStartDate || bill.paymentDate))) locations[location] = { name: location, date: usageDates[0] || bill.usageStartDate || bill.paymentDate, category };
    summaries.push({ id: bill._id, name: bill.name, amountCents, amountText: formatBillCents(amountCents), category });
  }
  summaries.sort((left, right) => left.id.localeCompare(right.id));
  const categoryList = Object.keys(categories).sort().map((category) => ({ category, amountCents: categories[category], amountText: formatBillCents(categories[category]), ratio: totalCents ? categories[category] / totalCents : 0 }));
  const locationList = Object.values(locations).sort((left, right) => String(left.date).localeCompare(String(right.date)) || left.name.localeCompare(right.name));
  const report = {
    title: trip.name + " · 我的报告",
    lead: "旅程结束后，每位同行人只会看到属于自己的回忆与花销。",
    totalCents,
    totalText: formatBillCents(totalCents),
    count: summaries.length,
    averageCents: days.length ? Math.floor(totalCents / days.length) : 0,
    averageText: formatBillCents(days.length ? Math.floor(totalCents / days.length) : 0),
    daily: days.map((date) => ({ date, amountCents: daily[date], amountText: formatBillCents(daily[date]) })),
    categories: categoryList,
    summaries,
    locations: locationList,
    routeText: locationList.map((location) => location.name).join(" · "),
    canDelete: true
  };
  const now = db.serverDate();
  if (existingReport) {
    await db.collection("personal_reports").doc(existingReport._id).update({ data: { status: "active", report, updatedAt: now } });
  } else {
    await db.collection("personal_reports").add({ data: { tripId: trip._id, userId: identity.user._id, status: "active", report, createdAt: now, updatedAt: now } });
  }
  return result(report);
}

async function deletePersonalReport(input = {}) {
  const identity = await currentIdentity(true);
  if (identity.error) return identity.error;
  const trip = await getTripDoc(input.tripId);
  if (!trip) return fail("TRIP_NOT_FOUND", "行程不存在");
  if (trip.status !== "ended") return fail("REPORT_NOT_READY", "行程结束后才能删除个人报告");
  const membership = await getMembership(trip._id, identity.user._id);
  if (!membership) return fail("FORBIDDEN", "你不是该行程成员");
  const existingReport = await getPersonalReportRecord(trip._id, identity.user._id);
  const now = db.serverDate();
  if (existingReport) {
    await db.collection("personal_reports").doc(existingReport._id).update({ data: { status: "deleted", report: null, deletedAt: now, updatedAt: now } });
  } else {
    await db.collection("personal_reports").add({ data: { tripId: trip._id, userId: identity.user._id, status: "deleted", report: null, deletedAt: now, createdAt: now, updatedAt: now } });
  }
  return result({ tripId: trip._id, deleted: true });
}

exports.main = async (event = {}) => {
  try {
    const payload = event.payload || event;
    switch (event.action) {
      case "bootstrapUser": return await bootstrapUser();
      case "listTrips": return await listTrips();
      case "createTrip": return await createTrip(payload);
      case "joinTrip": return await joinTrip(payload);
      case "getTrip": return await getTrip(payload);
      case "listMembers": return await listMembers(payload);
      case "updateTrip": return await updateTrip(payload);
      case "removeMember": return await removeMember(payload);
      case "getInvite": return await getInvite(payload);
      case "listBills": return await listBills(payload);
      case "getBill": return await getBill(payload);
      case "createBill": return await createBill(payload);
      case "updateBill": return await updateBill(payload);
      case "deleteBill": return await deleteBill(payload);
      case "previewSettlement": return await previewSettlement(payload);
      case "createSettlement": return await createSettlement(payload);
      case "listSettlements": return await listSettlements(payload);
      case "confirmSettlement": return await confirmSettlement(payload);
      case "endTrip": return await endTrip(payload);
      case "getPersonalReport": return await getPersonalReport(payload);
      case "deletePersonalReport": return await deletePersonalReport(payload);
      default: return fail("INVALID_ACTION", "不支持的云服务操作");
    }
  } catch (error) {
    return fail("INTERNAL_ERROR", "云端操作失败");
  }
};

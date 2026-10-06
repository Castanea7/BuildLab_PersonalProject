function pad(value) {
  return String(value).padStart(2, "0");
}

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parts = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}

function dateValue(value) {
  if (!isDateString(value)) return NaN;
  const parts = value.split("-").map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function compareDates(left, right) {
  return dateValue(left) - dateValue(right);
}

function dateRange(startDate, endDate, includeEnd = true) {
  if (!isDateString(startDate) || !isDateString(endDate) || compareDates(startDate, endDate) > 0) return [];
  const result = [];
  let cursor = dateValue(startDate);
  const end = dateValue(endDate);
  while (cursor <= end && (includeEnd || cursor < end)) {
    const date = new Date(cursor);
    result.push(date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()));
    cursor += 24 * 60 * 60 * 1000;
  }
  return result;
}

function parseAmountToCents(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  const text = String(value == null ? "" : value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function formatCents(cents) {
  return "¥" + (Number(cents || 0) / 100).toFixed(2);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function splitEvenCents(totalCents, memberIds, payerId) {
  const ids = Array.from(new Set(memberIds || []));
  if (!ids.length || !ids.includes(payerId) || !Number.isSafeInteger(totalCents) || totalCents < ids.length) return null;
  const shares = {};
  const otherAmount = Math.ceil(totalCents / ids.length);
  ids.forEach((id) => { if (id !== payerId) shares[id] = otherAmount; });
  shares[payerId] = totalCents - sum(Object.keys(shares).filter((id) => id !== payerId).map((id) => shares[id]));
  if (Object.values(shares).some((amount) => amount < 1) || sum(Object.values(shares)) !== totalCents) return null;
  return shares;
}

function normalizeCustomShares(shares, memberIds, totalCents) {
  const ids = Array.from(new Set(memberIds || []));
  if (!ids.length || !Number.isSafeInteger(totalCents) || totalCents < 0) return null;
  const normalized = {};
  ids.forEach((id) => { normalized[id] = Number(shares && shares[id]); });
  if (Object.values(normalized).some((amount) => !Number.isSafeInteger(amount) || amount < 0)) return null;
  return sum(Object.values(normalized)) === totalCents ? normalized : null;
}

function buildShares({ totalCents, splitMode, memberIds, payerId, customShares }) {
  if (splitMode === "treat") {
    if (!memberIds || !memberIds.includes(payerId)) return null;
    const shares = {};
    memberIds.forEach((id) => { shares[id] = id === payerId ? totalCents : 0; });
    return shares;
  }
  if (splitMode === "custom") return normalizeCustomShares(customShares, memberIds, totalCents);
  return splitEvenCents(totalCents, memberIds, payerId);
}

function classifyTiming(paymentDate, tripStartDate, tripEndDate) {
  if (compareDates(paymentDate, tripStartDate) < 0) return "booking";
  if (compareDates(paymentDate, tripEndDate) > 0) return "late_entry";
  return "normal";
}

function getUsageDates({ usageDateMode, usageStartDate, usageEndDate, tripStartDate, tripEndDate }) {
  const mode = usageDateMode || "single";
  const start = usageStartDate;
  const end = usageEndDate || usageStartDate;
  if (!isDateString(start) || !isDateString(end) || (mode === "single" ? compareDates(start, end) !== 0 : compareDates(start, end) >= 0)) return null;
  if (compareDates(start, tripStartDate) < 0 || compareDates(end, tripEndDate) > 0) return null;
  if (mode === "night_range") return dateRange(start, end, false);
  return dateRange(start, end, true);
}

function allocateAcrossDates(amount, dates) {
  if (!dates || !dates.length || !Number.isSafeInteger(amount) || amount < 0) return null;
  const base = Math.floor(amount / dates.length);
  const remainder = amount % dates.length;
  const result = {};
  dates.forEach((date, index) => { result[date] = base + (index < remainder ? 1 : 0); });
  return result;
}

function calculateBalances(bills, members) {
  const ids = (members || []).map((member) => member.id).sort();
  const balances = {};
  ids.forEach((id) => { balances[id] = 0; });
  (bills || []).forEach((bill) => {
    if (bill.privacy === "private") return;
    balances[bill.payerId] = (balances[bill.payerId] || 0) + bill.totalCents;
    Object.keys(bill.shares || {}).forEach((id) => { balances[id] = (balances[id] || 0) - bill.shares[id]; });
  });
  return balances;
}

function buildTransfers(balances) {
  const creditors = Object.keys(balances).filter((id) => balances[id] > 0).sort((a, b) => balances[b] - balances[a] || a.localeCompare(b)).map((id) => ({ id, amount: balances[id] }));
  const debtors = Object.keys(balances).filter((id) => balances[id] < 0).sort((a, b) => balances[a] - balances[b] || a.localeCompare(b)).map((id) => ({ id, amount: -balances[id] }));
  const transfers = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > 0) transfers.push({ fromId: debtor.id, toId: creditor.id, amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditorIndex += 1;
    if (debtor.amount === 0) debtorIndex += 1;
  }
  return transfers;
}

function buildReport({ trip, bills, memberId }) {
  const days = dateRange(trip.startDate, trip.endDate, true);
  const daily = {};
  days.forEach((date) => { daily[date] = 0; });
  const categoryTotals = {};
  const summaries = [];
  const locations = {};
  let totalCents = 0;
  let count = 0;
  (bills || []).forEach((bill) => {
    const amount = Number((bill.shares || {})[memberId] || 0);
    const isParticipant = Object.prototype.hasOwnProperty.call(bill.shares || {}, memberId);
    if (!isParticipant) return;
    totalCents += amount;
    count += 1;
    categoryTotals[bill.category || "其他"] = (categoryTotals[bill.category || "其他"] || 0) + amount;
    const usageDates = getUsageDates({ usageDateMode: bill.usageDateMode, usageStartDate: bill.usageStartDate, usageEndDate: bill.usageEndDate, tripStartDate: trip.startDate, tripEndDate: trip.endDate }) || [];
    const allocations = allocateAcrossDates(amount, usageDates);
    Object.keys(allocations || {}).forEach((date) => { daily[date] = (daily[date] || 0) + allocations[date]; });
    if (bill.location && !locations[bill.location]) locations[bill.location] = { name: bill.location, date: usageDates[0] || bill.usageStartDate };
    summaries.push({ id: bill.id, name: bill.name, amountCents: amount, amountText: formatCents(amount), category: bill.category || "其他" });
  });
  const categoryList = Object.keys(categoryTotals).sort().map((category) => ({ category, amountCents: categoryTotals[category], amountText: formatCents(categoryTotals[category]), ratio: totalCents ? categoryTotals[category] / totalCents : 0 }));
  return {
    totalCents,
    totalText: formatCents(totalCents),
    count,
    averageCents: days.length ? Math.floor(totalCents / days.length) : 0,
    averageText: formatCents(days.length ? Math.floor(totalCents / days.length) : 0),
    daily: days.map((date) => ({ date, amountCents: daily[date], amountText: formatCents(daily[date]) })),
    categories: categoryList,
    summaries,
    locations: Object.keys(locations).sort((a, b) => compareDates(locations[a].date, locations[b].date) || a.localeCompare(b)).map((key) => locations[key]),
    routeText: Object.keys(locations).sort((a, b) => compareDates(locations[a].date, locations[b].date) || a.localeCompare(b)).join(" · ")
  };
}

module.exports = {
  isDateString, compareDates, dateRange, parseAmountToCents, formatCents, sum, splitEvenCents,
  normalizeCustomShares, buildShares, classifyTiming, getUsageDates, allocateAcrossDates,
  calculateBalances, buildTransfers, buildReport
};

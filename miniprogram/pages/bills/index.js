const services = require("../../services/index");

const categories = ["餐饮", "住宿", "门票", "交通", "购物", "其他"];
const checkinCategories = ["住宿", "餐饮", "门票"];

Page({
  data: { trip: null, bills: [], members: [], displayMembers: [], selectedMembers: [], memberText: "", currentUserId: "user-me", categories, categoryIndex: 0, form: {}, error: "", editingId: "", showForm: false, showCheckin: false, pendingCheckinBill: null, checkinLocation: "", cloudMode: false },
  async onLoad(options) {
    const tripPromise = Promise.resolve(services.getTrip(options.trip));
    const userPromise = services.isCloudMode() ? Promise.resolve(services.bootstrapUserCloud()) : Promise.resolve(services.bootstrapUser());
    const [tripResult, userResult] = await Promise.all([tripPromise, userPromise]);
    const trip = tripResult.data;
    const currentUserId = userResult.ok && userResult.data && userResult.data.id ? userResult.data.id : "user-me";
    this.tripId = options.trip || (trip && trip.id);
    const members = trip ? trip.members.filter((member) => member.status === "active").map((member) => ({ ...member, displayName: member.id === currentUserId ? "我" : member.name })) : [];
    this.setData({ trip, members, currentUserId, showForm: false, cloudMode: services.isCloudMode() });
    await this.refresh();
    if (options.action === "create") this.openCreate();
    if (options.action === "edit" && options.bill) this.openEdit(options.bill);
  },
  async refresh() {
    const result = await Promise.resolve(services.listBills(this.tripId));
    if (!result.ok) { this.setData({ bills: [], error: result.error.message }); return result; }
    this.setData({ bills: result.data || [], error: "" });
    return result;
  },
  getCategoryIndex(category) { const index = categories.indexOf(category); return index < 0 ? 0 : index; },
  buildUsageText(form) {
    if (!form.usageStartDate) return "";
    if (form.usageDateMode === "single") return form.usageStartDate;
    if (!form.usageEndDate) return form.usageStartDate + " ~ 请选择结束日期";
    return form.usageStartDate + " ~ " + (form.usageEndDate || form.usageStartDate);
  },
  syncMemberDisplay(memberIds, splitMode) {
    const visibleMembers = splitMode === "treat" ? this.data.members.filter((member) => member.id === "user-me") : this.data.members;
    const displayMembers = visibleMembers.map((member) => ({ ...member, checked: memberIds.includes(member.id) }));
    const selectedMembers = this.data.members.filter((member) => memberIds.includes(member.id));
    const memberText = splitMode === "treat" ? "我" : selectedMembers.map((member) => member.displayName).join("、") || "请选择分摊成员";
    this.setData({ displayMembers, selectedMembers, memberText });
  },
  openCreate() {
    const today = this.data.trip ? this.data.trip.startDate : "";
    const currentUserId = this.data.currentUserId || "user-me";
    const form = { name: "", amount: "", category: "餐饮", privacy: "public", splitMode: "even", payerId: currentUserId, memberIds: this.data.members.map((member) => member.id), customSharesYuan: {}, paymentDate: today, usageDateMode: "single", usageStartDate: today, usageEndDate: today, usageText: today };
    this.setData({ showForm: true, editingId: "", error: "", categoryIndex: 0, form });
    this.syncMemberDisplay(form.memberIds, form.splitMode);
  },
  closeForm() { this.setData({ showForm: false, error: "" }); },
  noop() {},
  onInput(event) { this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value, error: "" }); },
  onPaymentDateChange(event) { this.setData({ "form.paymentDate": event.detail.value, error: "" }); },
  validateUsageDateSelection(field, value) {
    const trip = this.data.trip; const form = this.data.form;
    if (!trip || value < trip.startDate || value > trip.endDate) return `实际使用日期必须在行程范围内（${trip ? trip.startDate : ""}~${trip ? trip.endDate : ""}）`;
    const nextForm = { ...form, [field]: value };
    if (nextForm.usageDateMode !== "single" && nextForm.usageEndDate && nextForm.usageEndDate <= nextForm.usageStartDate) return "结束日期必须晚于开始日期";
    return "";
  },
  onUsageDateChange(event) {
    const field = event.currentTarget.dataset.field; const value = event.detail.value; const error = this.validateUsageDateSelection(field, value);
    if (error) { this.setData({ error }); return; }
    const form = { ...this.data.form, [field]: value };
    form.usageText = this.buildUsageText(form); this.setData({ form, error: "" });
  },
  onCategoryChange(event) {
    const categoryIndex = Number(event.detail.value); const category = categories[categoryIndex]; const form = { ...this.data.form, category, usageDateMode: category === "住宿" ? "night_range" : "single" };
    if (category !== "住宿") form.usageEndDate = form.usageStartDate;
    form.usageText = this.buildUsageText(form);
    this.setData({ categoryIndex, form, error: "" });
  },
  onPrivacyChange(event) { this.setData({ "form.privacy": event.detail.value, error: "" }); },
  onSplitModeChange(event) {
    const splitMode = event.detail.value; const memberIds = splitMode === "treat" ? ["user-me"] : (this.data.form.memberIds || []);
    this.setData({ "form.splitMode": splitMode, "form.memberIds": memberIds, error: "" }); this.syncMemberDisplay(memberIds, splitMode);
  },
  onUsageModeChange(event) { const form = { ...this.data.form, usageDateMode: event.detail.value }; form.usageEndDate = event.detail.value === "single" ? form.usageStartDate : ""; form.usageText = this.buildUsageText(form); this.setData({ form, error: "" }); },
  onCustomShareInput(event) { const shares = { ...(this.data.form.customSharesYuan || {}) }; shares[event.currentTarget.dataset.id] = event.detail.value; this.setData({ "form.customSharesYuan": shares, error: "" }); },
  onMemberToggle(event) {
    if (this.data.form.splitMode === "treat") {
      this.setData({ "form.memberIds": ["user-me"], error: "" });
      this.syncMemberDisplay(["user-me"], "treat");
      return;
    }
    const id = event.currentTarget.dataset.id; const checked = (event.detail.value || []).includes(id); const ids = this.data.form.memberIds || [];
    const memberIds = checked ? Array.from(new Set(ids.concat(id))) : ids.filter((item) => item !== id);
    this.setData({ "form.memberIds": memberIds, error: "" });
    this.syncMemberDisplay(memberIds, this.data.form.splitMode);
  },
  validateForm() {
    const form = this.data.form || {};
    if (!String(form.name || "").trim()) return "请填写消费名称";
    if (!String(form.amount || "").trim()) return "请输入金额";
    if (!form.category) return "请选择类目";
    if (!form.paymentDate) return "请选择付款日期";
    if (!form.usageStartDate) return "请选择实际使用日期";
    if (form.usageDateMode !== "single" && !form.usageEndDate) return "请选择结束日期";
    if (form.splitMode !== "treat" && !(form.memberIds || []).length) return "请选择分摊成员";
    if (form.splitMode === "custom" && (form.memberIds || []).some((id) => !String((form.customSharesYuan || {})[id] || "").trim())) return "请填写每位成员的分摊金额";
    return "";
  },
  async submitForm() {
    const formError = this.validateForm();
    if (formError) { this.setData({ error: formError }); return; }
    const input = { ...this.data.form, tripId: this.tripId };
    const result = this.data.editingId ? await Promise.resolve(services.updateBill(this.data.editingId, { ...input, expectedVersion: this.data.form.version })) : await Promise.resolve(services.createBill(input));
    if (!result.ok) { this.setData({ error: result.error.message }); return; }
    this.refresh();
    if (checkinCategories.includes(input.category) && !services.isCloudMode()) {
      this.setData({ showForm: false, error: "", editingId: "", pendingCheckinBill: result.data, checkinLocation: "", showCheckin: true });
      return;
    }
    this.setData({ showForm: false, error: "", editingId: "" });
  },
  onCheckinInput(event) { this.setData({ checkinLocation: event.detail.value, error: "" }); },
  saveCheckin() {
    const bill = this.data.pendingCheckinBill; const location = String(this.data.checkinLocation || "").trim();
    if (!bill) return;
    if (!location) { this.setData({ error: "请填写地点，或点击“跳过”" }); return; }
    const result = services.updateBill(bill.id, { ...bill, expectedVersion: bill.version, location });
    if (!result.ok) { this.setData({ error: result.error.message }); return; }
    this.setData({ showCheckin: false, pendingCheckinBill: null, checkinLocation: "", error: "" }); this.refresh();
  },
  skipCheckin() { this.setData({ showCheckin: false, pendingCheckinBill: null, checkinLocation: "", error: "" }); this.refresh(); },
  openEdit(billId) { this.editBill({ currentTarget: { dataset: { id: billId } } }); },
  async editBill(event) {
    const bill = await Promise.resolve(services.getBill(event.currentTarget.dataset.id));
    if (!bill.ok) { this.setData({ error: bill.error.message }); return; }
    const customSharesYuan = {};
    Object.keys(bill.data.shares || {}).forEach((id) => { customSharesYuan[id] = (bill.data.shares[id] / 100).toFixed(2); });
    const form = { ...bill.data, amount: (bill.data.totalCents / 100).toFixed(2), memberIds: Object.keys(bill.data.shares || {}), customSharesYuan, usageText: this.buildUsageText(bill.data) };
    this.setData({ editingId: bill.data.id, showForm: true, error: "", categoryIndex: this.getCategoryIndex(bill.data.category), form });
    this.syncMemberDisplay(form.memberIds, form.splitMode);
  },
  deleteBill(event) {
    const bill = this.data.bills.find((item) => item.id === event.currentTarget.dataset.id);
    wx.showModal({
      title: "删除账单",
      content: "删除后无法恢复，确定要删除这笔账单吗？",
      confirmText: "删除",
      cancelText: "取消",
      success: async ({ confirm }) => {
        if (!confirm) return;
        const result = await Promise.resolve(services.deleteBill(event.currentTarget.dataset.id, { expectedVersion: bill && bill.version }));
        if (!result.ok) { this.setData({ error: result.error.message }); return; }
        await this.refresh();
      }
    });
  },
  goBack() {
    if (getCurrentPages().length > 1) { wx.navigateBack(); return; }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

const services = require("../../services/index");

function formatCents(value) {
  return "¥" + (Number(value || 0) / 100).toFixed(2);
}

function decorateTrip(trip, bills) {
  if (!trip) return trip;
  const nextBills = bills || trip.bills || [];
  const totalCents = nextBills.reduce((sum, bill) => sum + Number(bill.totalCents || 0), 0);
  return { ...trip, bills: nextBills, totalExpenseText: formatCents(totalCents) };
}

Page({
  data: { trip: null, currentUserId: "", isOwner: false, showRecordHint: false, cloudMode: false, shareInfo: null, loading: true, loadError: "" },
  async onLoad(options = {}) {
    if (services.isCloudMode()) {
      const [userResult, tripResult, billsResult] = await Promise.all([
        Promise.resolve(services.bootstrapUserCloud()),
        Promise.resolve(services.getTrip(options.trip)),
        Promise.resolve(services.listBills(options.trip))
      ]);
      if (!userResult.ok) { this.setData({ loading: false, loadError: userResult.error.message }); return; }
      if (!tripResult.ok || !tripResult.data) { this.setData({ loading: false, loadError: tripResult.error ? tripResult.error.message : "行程不存在" }); return; }
      const trip = decorateTrip(tripResult.data, billsResult.ok ? billsResult.data : []);
      this.setData({
        trip,
        currentUserId: userResult.data.id,
        isOwner: tripResult.data.ownerId === userResult.data.id,
        showRecordHint: options.action === "record",
        cloudMode: true,
        shareInfo: null,
        loading: false,
        loadError: ""
      });
      await this.prepareShare();
      return;
    }
    const tripResult = services.getTrip(options.trip);
    const trip = tripResult.data;
    const state = services.getMockState().data;
    this.setData({ trip, currentUserId: state.currentUserId, isOwner: state.role === "owner", showRecordHint: options.action === "record", cloudMode: false, shareInfo: null, loading: false, loadError: trip ? "" : "行程不存在" });
    await this.prepareShare();
  },
  async onShow() {
    if (!this.data.trip) return;
    const [tripResult, billsResult] = await Promise.all([
      Promise.resolve(services.getTrip(this.data.trip.id)),
      services.isCloudMode() ? Promise.resolve(services.listBills(this.data.trip.id)) : Promise.resolve({ ok: true, data: this.data.trip.bills || [] })
    ]);
    if (tripResult.ok && tripResult.data) {
      const trip = decorateTrip(tripResult.data, billsResult.ok ? billsResult.data : []);
      this.setData({ trip, isOwner: trip.ownerId === this.data.currentUserId });
      await this.prepareShare();
    }
  },
  async prepareShare() {
    if (!this.data.trip || this.data.trip.status !== "进行中") return;
    const result = await Promise.resolve(services.getInvite(this.data.trip.id));
    if (!result.ok || !result.data) return;
    const path = result.data.sharePath || "/pages/join/index?inviteCode=" + result.data.code;
    this.setData({ shareInfo: { code: result.data.code, path } });
  },
  onShareAppMessage() {
    const trip = this.data.trip;
    const shareInfo = this.data.shareInfo;
    const code = shareInfo && shareInfo.code || trip && trip.inviteCode;
    return {
      title: trip ? "邀请你加入「" + trip.name + "」" : "邀请你加入同行行程",
      path: shareInfo ? shareInfo.path : code ? "/pages/join/index?inviteCode=" + encodeURIComponent(code) : "/pages/join/index"
    };
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  },
  record() {
    wx.navigateTo({ url: "/pages/bills/index?trip=" + this.data.trip.id + "&action=create" });
  },
  copyInvite() {
    const shareInfo = this.data.shareInfo;
    const code = shareInfo && shareInfo.code || this.data.trip && this.data.trip.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: "邀请码已复制", icon: "none" })
    });
  },
  editBill(event) { wx.navigateTo({ url: "/pages/bills/index?trip=" + this.data.trip.id + "&action=edit&bill=" + event.currentTarget.dataset.id }); },
  async viewBill(event) {
    const result = await Promise.resolve(services.getBill(event.currentTarget.dataset.id));
    if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
    wx.showModal({ title: result.data.name, content: "总金额 " + result.data.amountText + "\n我承担 " + result.data.shareText, showCancel: false, confirmText: "知道了" });
  },
  async deleteBill(event) {
    const bill = (this.data.trip.bills || []).find((item) => item.id === event.currentTarget.dataset.id);
    wx.showModal({
      title: "删除账单",
      content: "删除后无法恢复，确定要删除这笔账单吗？",
      confirmText: "删除",
      cancelText: "取消",
      success: async ({ confirm }) => {
        if (!confirm) return;
        const result = await Promise.resolve(services.deleteBill(event.currentTarget.dataset.id, { expectedVersion: bill && bill.version }));
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
        const [tripResult, billsResult] = await Promise.all([Promise.resolve(services.getTrip(this.data.trip.id)), Promise.resolve(services.listBills(this.data.trip.id))]);
        if (tripResult.ok && tripResult.data) this.setData({ trip: decorateTrip(tripResult.data, billsResult.ok ? billsResult.data : []) });
        wx.showToast({ title: "账单已删除", icon: "none" });
      }
    });
  },
  async goSettlement() {
    const result = await Promise.resolve(services.previewSettlement(this.data.trip.id));
    if (!result.ok) {
      if (result.error && result.error.code === "NO_SETTLEMENT") {
        wx.showModal({ title: "无需结账", content: "当前行程没有公共账单或待结算欠款，无需结账，可以直接结束行程。", showCancel: false, confirmText: "知道了" });
        return;
      }
      wx.showToast({ title: result.error ? result.error.message : "暂时无法查看结账信息", icon: "none" });
      return;
    }
    if (!result.data || !Array.isArray(result.data.billIds) || !result.data.billIds.length) {
      wx.showModal({ title: "无需结账", content: "当前行程没有公共账单或待结算欠款，无需结账，可以直接结束行程。", showCancel: false, confirmText: "知道了" });
      return;
    }
    wx.navigateTo({ url: "/pages/settlement/index?trip=" + this.data.trip.id });
  },
  async getPendingSettlementNames() {
    const result = await Promise.resolve(services.listSettlements(this.data.trip.id));
    if (!result.ok || !Array.isArray(result.data)) return [];
    const members = this.data.trip.members || [];
    const names = result.data
      .filter((settlement) => settlement.status !== "complete")
      .reduce((pendingNames, settlement) => {
        const confirmations = settlement.confirmations || {};
        const currentNames = (settlement.memberIds || [])
          .filter((memberId) => !confirmations[memberId])
          .map((memberId) => {
            const member = members.find((item) => item.id === memberId);
            return member && member.name ? member.name : "同行成员";
          });
        return pendingNames.concat(currentNames);
      }, []);
    return Array.from(new Set(names));
  },
  async showEndTripBlockedMessage(error) {
    const preview = await Promise.resolve(services.previewSettlement(this.data.trip.id));
    const hasUnsettledDebt = preview.ok && preview.data && Array.isArray(preview.data.transfers) && preview.data.transfers.length;
    if (hasUnsettledDebt || (error && /欠款|未结清/.test(error.message || ""))) {
      wx.showModal({ title: "暂不能结束行程", content: "当前还有未结清的公共账单或欠款，请先完成结账后再结束行程。", showCancel: false, confirmText: "知道了" });
      return;
    }
    const names = await this.getPendingSettlementNames();
    wx.showModal({
      title: "暂不能结束行程",
      content: names.length ? `以下成员尚未确认结账：${names.join("、")}。请全部确认后再结束行程。` : "还有成员尚未确认结账，请全部确认后再结束行程。",
      showCancel: false,
      confirmText: "知道了"
    });
  },
  endTrip() {
    wx.showModal({
      title: "结束行程",
      content: "结束后将无法继续记账，且不能恢复。确定结束行程吗？",
      confirmText: "结束行程",
      cancelText: "取消",
      success: async ({ confirm }) => {
        if (!confirm) return;
        const result = await Promise.resolve(services.endTrip(this.data.trip.id));
        if (!result.ok) {
          if (result.error && result.error.code === "TRIP_NOT_READY") {
            await this.showEndTripBlockedMessage(result.error);
            return;
          }
          wx.showToast({ title: result.error.message, icon: "none" });
          return;
        }
        this.setData({ trip: result.data });
        wx.showToast({ title: "行程已结束", icon: "none" });
      }
    });
  },
  removeMember(event) {
    const member = (this.data.trip.members || []).find((item) => item.id === event.currentTarget.dataset.id);
    wx.showModal({
      title: "移除成员",
      content: `移除${member ? member.name : "该成员"}后，对方将不能新增或修改本行程数据。确定移除吗？`,
      confirmText: "移除",
      cancelText: "取消",
      success: async ({ confirm }) => {
        if (!confirm) return;
        const result = await Promise.resolve(services.removeMember(this.data.trip.id, event.currentTarget.dataset.id));
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
        const refreshed = await Promise.resolve(services.getTrip(this.data.trip.id));
        if (refreshed.ok && refreshed.data) this.setData({ trip: refreshed.data });
        wx.showToast({ title: "成员已移除", icon: "none" });
      }
    });
  }
});

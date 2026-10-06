const services = require("../../services/index");

Page({
  onLoad(options) {
    const trip = services.getTrip(options.trip).data;
    const state = services.getMockState().data;
    this.setData({ trip, currentUserId: state.currentUserId, isOwner: state.role === "owner", showRecordHint: options.action === "record" });
  },
  onShow() {
    if (!this.data.trip) return;
    const refreshed = services.getTrip(this.data.trip.id).data;
    if (refreshed) this.setData({ trip: refreshed });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  },
  record() { wx.navigateTo({ url: "/pages/bills/index?trip=" + this.data.trip.id + "&action=create" }); },
  editBill(event) { wx.navigateTo({ url: "/pages/bills/index?trip=" + this.data.trip.id + "&action=edit&bill=" + event.currentTarget.dataset.id }); },
  viewBill(event) {
    const result = services.getBill(event.currentTarget.dataset.id);
    if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
    wx.showModal({ title: result.data.name, content: "总金额 " + result.data.amountText + "\n我承担 " + result.data.shareText, showCancel: false, confirmText: "知道了" });
  },
  deleteBill(event) {
    wx.showModal({
      title: "删除账单",
      content: "删除后无法恢复，确定要删除这笔账单吗？",
      confirmText: "删除",
      cancelText: "取消",
      success: ({ confirm }) => {
        if (!confirm) return;
        const result = services.deleteBill(event.currentTarget.dataset.id);
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
        const refreshed = services.getTrip(this.data.trip.id).data;
        this.setData({ trip: refreshed });
        wx.showToast({ title: "账单已删除", icon: "none" });
      }
    });
  },
  goSettlement() { wx.navigateTo({ url: "/pages/settlement/index?trip=" + this.data.trip.id }); },
  endTrip() {
    wx.showModal({
      title: "结束行程",
      content: "结束后将无法继续记账，且不能恢复。确定结束行程吗？",
      confirmText: "结束行程",
      cancelText: "取消",
      success: ({ confirm }) => {
        if (!confirm) return;
        const result = services.endTrip(this.data.trip.id);
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
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
      success: ({ confirm }) => {
        if (!confirm) return;
        const result = services.removeMember(this.data.trip.id, event.currentTarget.dataset.id);
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
        const refreshed = services.getTrip(this.data.trip.id).data;
        this.setData({ trip: refreshed });
        wx.showToast({ title: "成员已移除", icon: "none" });
      }
    });
  }
});

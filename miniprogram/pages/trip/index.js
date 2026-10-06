const services = require("../../services/index");

Page({
  onLoad(options) {
    const trip = services.getTrip(options.trip).data;
    const state = services.getMockState().data;
    this.setData({ trip, isOwner: state.role === "owner", showRecordHint: options.action === "record" });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  },
  goBills() { wx.navigateTo({ url: "/pages/bills/index?trip=" + this.data.trip.id }); },
  record() { wx.navigateTo({ url: "/pages/bills/index?trip=" + this.data.trip.id + "&action=create" }); },
  goSettlement() { wx.navigateTo({ url: "/pages/settlement/index?trip=" + this.data.trip.id }); },
  endTrip() {
    const result = services.endTrip(this.data.trip.id);
    if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
    this.setData({ trip: result.data });
    wx.showToast({ title: "行程已结束", icon: "none" });
  },
  removeMember(event) {
    const result = services.removeMember(this.data.trip.id, event.currentTarget.dataset.id);
    if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
    const refreshed = services.getTrip(this.data.trip.id).data;
    this.setData({ trip: refreshed });
    wx.showToast({ title: "成员已移除", icon: "none" });
  }
});

const services = require("../../services/index");

Page({
  onLoad(options) {
    this.tripId = options.trip;
    this.refresh();
  },
  refresh() {
    const preview = services.previewSettlement(this.tripId);
    const settlements = services.listSettlements(this.tripId);
    this.setData({ preview: preview.ok ? preview.data : { transfers: [], balanceText: "¥0.00", error: preview.error && preview.error.message }, settlements: settlements.data || [] });
  },
  createSettlement() {
    const result = services.createSettlement(this.tripId);
    if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
    this.refresh(); wx.showToast({ title: "已生成结账快照", icon: "none" });
  },
  confirmSettlement(event) {
    const result = services.confirmSettlement(event.currentTarget.dataset.id);
    if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
    this.refresh(); wx.showToast({ title: "已记录结清", icon: "none" });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

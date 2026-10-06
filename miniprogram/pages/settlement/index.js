const services = require("../../services/index");

Page({
  onLoad(options) {
    this.tripId = options.trip;
    const state = services.getMockState().data;
    this.setData({ currentUserId: state.currentUserId });
    this.refresh();
  },
  refresh() {
    const preview = services.previewSettlement(this.tripId);
    const settlements = services.listSettlements(this.tripId);
    this.setData({ preview: preview.ok ? preview.data : { transfers: [], balanceLabel: "这趟我还要补上", balanceText: "¥0.00", error: preview.error && preview.error.message }, settlements: settlements.data || [] });
  },
  createSettlement() {
    wx.showModal({
      title: "创建结账快照",
      content: "创建后本轮账单会锁定，并进入下一阶段。确定继续吗？",
      confirmText: "继续",
      cancelText: "取消",
      success: ({ confirm }) => {
        if (!confirm) return;
        const result = services.createSettlement(this.tripId);
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
        this.refresh(); wx.showToast({ title: "已生成结账快照", icon: "none" });
      }
    });
  },
  confirmSettlement(event) {
    wx.showModal({
      title: "确认结清",
      content: "确认已经完成这笔线下结算吗？确认后会记录为已结清。",
      confirmText: "确认结清",
      cancelText: "取消",
      success: ({ confirm }) => {
        if (!confirm) return;
        const result = services.confirmSettlement(event.currentTarget.dataset.id);
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
        this.refresh(); wx.showToast({ title: "已记录结清", icon: "none" });
      }
    });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

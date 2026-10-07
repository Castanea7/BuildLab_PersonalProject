const services = require("../../services/index");

Page({
  data: { preview: { transfers: [], billIds: [] }, settlements: [], currentUserId: "", cloudMode: false },
  async onLoad(options) {
    this.tripId = options.trip;
    if (services.isCloudMode()) {
      const userResult = await Promise.resolve(services.bootstrapUserCloud());
      if (userResult.ok) this.setData({ currentUserId: userResult.data.id, cloudMode: true });
    } else {
      const state = services.getMockState().data;
      this.setData({ currentUserId: state.currentUserId, cloudMode: false });
    }
    await this.refresh();
  },
  async refresh() {
    const [preview, settlements] = await Promise.all([Promise.resolve(services.previewSettlement(this.tripId)), Promise.resolve(services.listSettlements(this.tripId))]);
    this.setData({ preview: preview.ok ? preview.data : { transfers: [], billIds: [], balanceLabel: "这趟我还要补上", balanceText: "¥0.00", error: preview.error && preview.error.message }, settlements: settlements.data || [] });
  },
  createSettlement() {
    wx.showModal({
      title: "创建结账快照",
      content: "创建后本轮账单会锁定，并进入下一阶段，操作不可逆。确定继续吗？",
      confirmText: "继续",
      cancelText: "取消",
      success: async ({ confirm }) => {
        if (!confirm) return;
        const result = await Promise.resolve(services.createSettlement(this.tripId));
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
        await this.refresh(); wx.showToast({ title: "已生成结账快照", icon: "none" });
      }
    });
  },
  confirmSettlement(event) {
    wx.showModal({
      title: "确认结清",
      content: "确认已经完成这笔线下结算吗？确认后将记录为已结清，操作不可撤销。",
      confirmText: "确认结清",
      cancelText: "取消",
      success: async ({ confirm }) => {
        if (!confirm) return;
        const result = await Promise.resolve(services.confirmSettlement(event.currentTarget.dataset.id));
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
        await this.refresh(); wx.showToast({ title: "已记录结清", icon: "none" });
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

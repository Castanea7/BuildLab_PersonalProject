const services = require("../../services/index");

Page({
  onShow() {
    this.refreshHome();
  },
  onShareAppMessage() {
    return {
      title: "和朋友一起，把每一笔快乐都记下来！",
      path: "/pages/home/index"
    };
  },
  async refreshHome() {
    if (services.isCloudMode()) {
      const result = await Promise.resolve(services.listTrips());
      if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
      const trips = result.data || [];
      const sortByRecentOperation = (left, right) => {
        const leftTime = Date.parse(left.lastOperatedAt || left.updatedAt || left.createdAt || "") || 0;
        const rightTime = Date.parse(right.lastOperatedAt || right.updatedAt || right.createdAt || "") || 0;
        return rightTime - leftTime;
      };
      const activeTrips = trips.filter((trip) => trip.status === "进行中").sort(sortByRecentOperation);
      const endedTrips = trips.filter((trip) => trip.status === "已结束").sort(sortByRecentOperation);
      let activeTrip = activeTrips[0] || null;
      if (activeTrip) {
        const balanceResult = await Promise.resolve(services.previewSettlement(activeTrip.id));
        if (balanceResult.ok && balanceResult.data) activeTrip = { ...activeTrip, ...balanceResult.data };
      }
      this.setData({ state: { activeTrips, endedTrips, scenarioId: "" }, currentTrip: activeTrip, activeTrip, endedTrip: endedTrips[0] || null, cloudMode: true, isDevelopment: services.isDevelopment(), scenarios: [] });
      return;
    }
    const state = services.getMockState().data;
    this.setData({ state, currentTrip: state.activeTrips[0] || null, activeTrip: state.activeTrips[0] || null, endedTrip: state.endedTrips[0] || null, cloudMode: false, isDevelopment: services.isDevelopment(), scenarios: services.listMockScenarios().data });
  },
  openMenu() {
    const isDevelopment = services.isDevelopment();
    const menuItems = ["欠款怎么算", "关于同行小本"];
    if (isDevelopment) {
      menuItems.push("开发设置", services.isCloudMode() ? "切换到 Mock 演示" : "切换到 Cloud 行程", "重置 Mock 数据");
    }
    wx.showActionSheet({
      itemList: menuItems,
      success: ({ tapIndex }) => {
        if (tapIndex === 0) { this.openDebtHelp(); return; }
        if (tapIndex === 1) { wx.navigateTo({ url: "/pages/about/index" }); return; }
        if (tapIndex === 2 && isDevelopment) { this.openMockSettings(); return; }
        if (tapIndex === 3 && isDevelopment) { this.switchServiceMode(); return; }
        if (tapIndex === 4 && isDevelopment) { this.resetMockData(); return; }
        wx.showToast({
          title: "同行小本 · 前端原型",
          icon: "none"
        });
      }
    });
  },
  openDebtHelp() {
    wx.navigateTo({ url: "/pages/debt/index" });
  },
  openMockSettings() {
    this.setData({ showScenarioPicker: true });
  },
  closeMockSettings() {
    this.setData({ showScenarioPicker: false });
  },
  noop() {},
  selectMockScenario(event) {
    const result = services.setMockScenario(event.currentTarget.dataset.id);
    if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
    this.setData({ showScenarioPicker: false });
    this.refreshHome();
    wx.showToast({ title: "Mock 场景已切换", icon: "none" });
  },
  resetMockData() {
    wx.showModal({
      title: "重置 Mock 数据",
      content: "当前演示数据将被清除并恢复默认场景，无法恢复。确定重置吗？",
      confirmText: "重置",
      cancelText: "取消",
      success: ({ confirm }) => {
        if (!confirm) return;
        const result = services.resetMockData();
        if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
        this.refreshHome();
        wx.showToast({ title: "Mock 数据已重置", icon: "none" });
      }
    });
  },
  switchServiceMode() {
    const nextMode = services.isCloudMode() ? "mock" : "cloud";
    services.setServiceMode(nextMode);
    wx.reLaunch({ url: "/pages/home/index" });
  },

  navigate(event) {
    const { url } = event.currentTarget.dataset;
    if (url) wx.navigateTo({ url });
  },

  goTrip(event) {
    const id = event && event.currentTarget.dataset.tripId;
    const trip = id ? { id } : this.data.currentTrip;
    if (trip && trip.id) wx.navigateTo({ url: "/pages/trip/index?trip=" + trip.id });
  },
  openTripList(event) { wx.navigateTo({ url: "/pages/trips/index?mode=" + event.currentTarget.dataset.mode }); },
  goSettlement(event) {
    const id = event && event.currentTarget.dataset.tripId;
    if (id) wx.navigateTo({ url: "/pages/settlement/index?trip=" + id });
  },
  recordTrip(event) {
    const id = event && event.currentTarget.dataset.tripId;
    const trip = id ? { id } : this.data.currentTrip;
    if (trip && trip.id) wx.navigateTo({ url: "/pages/bills/index?trip=" + trip.id + "&action=create" });
  },
  openReport(event) {
    const id = event && event.currentTarget.dataset.tripId;
    const trip = id ? { id } : this.data.endedTrip;
    if (trip && trip.id) wx.navigateTo({ url: "/pages/report/index?trip=" + trip.id });
  },

  toTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 240 });
  }
});

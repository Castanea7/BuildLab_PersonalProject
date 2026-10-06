const services = require("../../services/index");

Page({
  onLoad() {
    this.refreshHome();
  },
  refreshHome() {
    const state = services.getMockState().data;
    this.setData({ state, currentTrip: state.activeTrips[0] || null, activeTrip: state.activeTrips[0] || null, endedTrip: state.endedTrips[0] || null, isDevelopment: services.isDevelopment(), scenarios: services.listMockScenarios().data });
  },
  openMenu() {
    const menuItems = ["使用帮助", "关于同行小本"];
    if (services.isDevelopment()) menuItems.push("开发设置", "重置 Mock 数据");
    wx.showActionSheet({
      itemList: menuItems,
      success: ({ tapIndex }) => {
        if (tapIndex === 2) { this.openMockSettings(); return; }
        if (tapIndex === 3) { this.resetMockData(); return; }
        wx.showToast({
          title: tapIndex === 0 ? "请从首页选择一个行程开始" : "同行小本 · 前端原型",
          icon: "none"
        });
      }
    });
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
    const result = services.resetMockData();
    if (!result.ok) { wx.showToast({ title: result.error.message, icon: "none" }); return; }
    this.refreshHome();
    wx.showToast({ title: "Mock 数据已重置", icon: "none" });
  },

  navigate(event) {
    const { url } = event.currentTarget.dataset;
    if (url) wx.navigateTo({ url });
  },

  goTrip(event) { const id = event && event.currentTarget.dataset.tripId; const trip = id ? services.getTrip(id).data : this.data.currentTrip; if (trip) wx.navigateTo({ url: "/pages/trip/index?trip=" + trip.id }); },
  openTripList(event) { wx.navigateTo({ url: "/pages/trips/index?mode=" + event.currentTarget.dataset.mode }); },
  goSettlement(event) { const id = event && event.currentTarget.dataset.tripId; if (id) wx.navigateTo({ url: "/pages/settlement/index?trip=" + id }); },
  recordTrip(event) { const id = event && event.currentTarget.dataset.tripId; const trip = id ? services.getTrip(id).data : this.data.currentTrip; if (trip) wx.navigateTo({ url: "/pages/bills/index?trip=" + trip.id + "&action=create" }); },
  openReport(event) { const id = event && event.currentTarget.dataset.tripId; const trip = id ? services.getTrip(id).data : this.data.endedTrip; if (trip) wx.navigateTo({ url: "/pages/report/index?trip=" + trip.id }); },

  toTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 240 });
  }
});

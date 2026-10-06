const services = require("../../services/index");

Page({
  data: { mode: "active", title: "进行中的行程", trips: [] },
  onLoad(options) {
    this.mode = options.mode === "ended" ? "ended" : "active";
    this.setData({ mode: this.mode, title: this.mode === "ended" ? "历史行程" : "进行中的行程" });
    this.refresh();
  },
  refresh() {
    const trips = services.listTrips().data || [];
    this.setData({ trips: trips.filter((trip) => this.mode === "ended" ? trip.status === "已结束" : trip.status === "进行中") });
  },
  openTrip(event) {
    const id = event.currentTarget.dataset.id;
    if (this.mode === "ended") { wx.navigateTo({ url: "/pages/report/index?trip=" + id }); return; }
    wx.navigateTo({ url: "/pages/trip/index?trip=" + id });
  },
  record(event) {
    wx.navigateTo({ url: "/pages/bills/index?trip=" + event.currentTarget.dataset.id + "&action=create" });
  },
  goBack() {
    if (getCurrentPages().length > 1) { wx.navigateBack(); return; }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

const services = require("../../services/index");

Page({
  onLoad(options) {
    const result = services.getPersonalReport(options.trip);
    this.setData({ report: result.ok ? result.data : { title: "报告暂不可见", lead: result.error.message, totalText: "¥0.00", daily: [], categories: [], summaries: [], locations: [] }, error: result.ok ? "" : result.error.message });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

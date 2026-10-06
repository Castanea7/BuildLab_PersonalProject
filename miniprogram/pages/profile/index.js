const services = require("../../services/index");

Page({
  async onLoad() {
    const result = services.isCloudMode() ? await Promise.resolve(services.bootstrapUserCloud()) : services.bootstrapUser();
    this.setData({ user: result.ok ? result.data : { name: "微信用户", subtitle: result.error && result.error.message || "暂时无法加载用户信息" } });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

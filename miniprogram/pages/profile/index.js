const services = require("../../services/index");

Page({
  onLoad() { this.setData({ user: services.bootstrapUser().data }); },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

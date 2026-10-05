Page({
  onLoad(options) {
    this.setData({ showRecordHint: options.action === "record" });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  },
  goBills() { wx.navigateTo({ url: "/pages/bills/index" }); },
  record() { wx.showToast({ title: "记账表单将在后续页面实现", icon: "none" }); }
});

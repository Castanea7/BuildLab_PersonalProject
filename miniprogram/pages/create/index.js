Page({
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  },
  submit() { wx.navigateTo({ url: "/pages/trip/index?trip=new" }); }
});

Page({
  onShareAppMessage() {
    return {
      title: "欠款怎么算？和朋友一起轻松结账！",
      path: "/pages/home/index"
    };
  },
  onShareTimeline() {
    return {
      title: "同行小本：搞清楚每一笔钱，和朋友一起轻松结账！"
    };
  },
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

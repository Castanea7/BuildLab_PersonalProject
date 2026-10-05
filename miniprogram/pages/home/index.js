Page({
  openMenu() {
    wx.showActionSheet({
      itemList: ["使用帮助", "关于同行小本"],
      success: ({ tapIndex }) => {
        wx.showToast({
          title: tapIndex === 0 ? "帮助页待完善" : "同行小本 · 前端原型",
          icon: "none"
        });
      }
    });
  },

  navigate(event) {
    const { url } = event.currentTarget.dataset;
    if (url) wx.navigateTo({ url });
  },

  toTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 240 });
  }
});

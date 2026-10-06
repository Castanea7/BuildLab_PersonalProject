const services = require("../../services/index");

Page({
  data: { inviteCode: "", error: "" },
  onLoad(options) {
    if (options && options.inviteCode) this.setData({ inviteCode: String(options.inviteCode).slice(0, 4) });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  },
  onInviteInput(event) { this.setData({ inviteCode: event.detail.value.replace(/[^0-9]/g, "").slice(0, 4), error: "" }); },
  async submit() {
    if (!/^\d{4}$/.test(this.data.inviteCode)) { this.setData({ error: "请输入 4 位邀请码" }); return; }
    const result = await Promise.resolve(services.joinTrip({ inviteCode: this.data.inviteCode }));
    if (!result.ok) { this.setData({ error: result.error.message }); return; }
    wx.navigateTo({ url: "/pages/trip/index?trip=" + result.data.id });
  }
});

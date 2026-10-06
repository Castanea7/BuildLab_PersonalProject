const services = require("../../services/index");

Page({
  data: { name: "", startDate: "", endDate: "", error: "", createdTrip: null },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  },
  onNameInput(event) { this.setData({ name: event.detail.value, error: "" }); },
  onStartDateChange(event) { this.setData({ startDate: event.detail.value, error: "" }); },
  onEndDateChange(event) { this.setData({ endDate: event.detail.value, error: "" }); },
  noop() {},
  async submit() {
    if (!String(this.data.name || "").trim()) { this.setData({ error: "请填写行程名称" }); return; }
    if (!this.data.startDate) { this.setData({ error: "请选择开始日期" }); return; }
    if (!this.data.endDate) { this.setData({ error: "请选择结束日期" }); return; }
    const result = await Promise.resolve(services.createTrip({ name: this.data.name, startDate: this.data.startDate, endDate: this.data.endDate }));
    if (!result.ok) { this.setData({ error: result.error.message }); return; }
    this.setData({ createdTrip: result.data });
  },
  copyInvite() {
    if (!this.data.createdTrip) return;
    wx.setClipboardData({
      data: this.data.createdTrip.inviteCode,
      success: () => wx.showToast({ title: "邀请码已复制", icon: "none" })
    });
  },
  onShareAppMessage() {
    const trip = this.data.createdTrip;
    const code = trip && trip.inviteCode;
    return {
      title: trip ? "邀请你加入「" + trip.name + "」" : "邀请你加入同行行程",
      path: code ? "/pages/join/index?inviteCode=" + encodeURIComponent(code) : "/pages/join/index"
    };
  },
  closeCreatedModal() {
    if (!this.data.createdTrip) return;
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

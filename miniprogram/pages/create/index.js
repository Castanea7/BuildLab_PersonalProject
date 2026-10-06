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
  submit() {
    const result = services.createTrip({ name: this.data.name, startDate: this.data.startDate, endDate: this.data.endDate });
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
  closeCreatedModal() {
    if (!this.data.createdTrip) return;
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

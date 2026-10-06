const cloudConfig = require("./config/cloud.js");

App({
  onLaunch() {
    if (typeof wx !== "undefined" && wx.cloud && typeof wx.cloud.init === "function") {
      wx.cloud.init(cloudConfig.getInitOptions());
    }
  }
});

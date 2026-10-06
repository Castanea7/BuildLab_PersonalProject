const FUNCTION_NAME = "app";

function getInitOptions() {
  const options = { traceUser: true };
  if (typeof wx !== "undefined" && wx.cloud && wx.cloud.DYNAMIC_CURRENT_ENV) {
    options.env = wx.cloud.DYNAMIC_CURRENT_ENV;
  }
  return options;
}

module.exports = { FUNCTION_NAME, getInitOptions };

const MODE_KEY = "同行小本.serviceMode";

function getEnvironmentVersion() {
  try {
    const account = typeof wx !== "undefined" && typeof wx.getAccountInfoSync === "function" ? wx.getAccountInfoSync() : null;
    return account && account.miniProgram && account.miniProgram.envVersion || "";
  } catch (error) {
    return "";
  }
}

function isDevelopmentBuild() {
  return getEnvironmentVersion() === "develop";
}

function getServiceMode() {
  const envVersion = getEnvironmentVersion();
  if (envVersion === "trial" || envVersion === "release") return "cloud";
  if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") return "mock";
  return wx.getStorageSync(MODE_KEY) === "cloud" ? "cloud" : "mock";
}

function isCloudMode() { return getServiceMode() === "cloud"; }

function setServiceMode(mode) {
  const nextMode = !isDevelopmentBuild() ? "cloud" : mode === "cloud" ? "cloud" : "mock";
  if (typeof wx !== "undefined" && typeof wx.setStorageSync === "function") wx.setStorageSync(MODE_KEY, nextMode);
  return { ok: true, code: "OK", data: nextMode, error: null };
}

module.exports = { getServiceMode, isCloudMode, setServiceMode, isDevelopmentBuild };

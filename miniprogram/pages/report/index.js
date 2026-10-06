const services = require("../../services/index");

function formatShortDate(value) {
  const parts = String(value || "").split("-");
  return parts.length === 3 ? parts[1] + "/" + parts[2] : value || "";
}

function decorateReport(report) {
  const daily = report.daily || [];
  const maxDaily = Math.max.apply(null, daily.map((item) => item.amountCents).concat([1]));
  const categories = report.categories || [];
  const palette = ["#6fa9e8", "#9bc9f2", "#ffd477", "#f6aca4", "#c5a7e9", "#bfc9cf"];
  const titleParts = String(report.title || "我的报告").split(" · ");
  return {
    ...report,
    tripName: titleParts[0],
    pageTitle: "我的报告",
    daily: daily.map((item) => ({ ...item, shortDate: formatShortDate(item.date), barHeight: Math.max(18, Math.round(item.amountCents / maxDaily * 142)) })),
    categories: categories.map((item, index) => ({ ...item, ratioText: Math.round(item.ratio * 100) + "%", barWidth: Math.max(5, Math.round(item.ratio * 100)) + "%", color: palette[index % palette.length] })),
    locations: (report.locations || []).map((item) => ({ ...item, shortDate: formatShortDate(item.date) })),
    summaries: (report.summaries || []).map((item) => ({ ...item, categoryLabel: item.category || "其他" }))
  };
}

Page({
  onLoad(options) {
    const result = services.getPersonalReport(options.trip);
    const report = result.ok ? decorateReport(result.data) : decorateReport({ title: "报告暂不可见", lead: result.error.message, totalText: "¥0.00", count: 0, averageText: "¥0.00", daily: [], categories: [], summaries: [], locations: [] });
    this.setData({ report, error: result.ok ? "" : result.error.message });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

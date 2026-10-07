const services = require("../../services/index");

function formatShortDate(value) {
  const parts = String(value || "").split("-");
  return parts.length === 3 ? parts[1] + "/" + parts[2] : value || "";
}

function formatDayLabel(value) {
  const parts = String(value || "").split("-");
  return parts.length === 3 ? Number(parts[1]) + "月" + Number(parts[2]) + "日" : value || "";
}

function iconTypeForCategory(category) {
  if (category === "餐饮") return "food";
  if (category === "住宿") return "stay";
  if (category === "门票") return "ticket";
  if (category === "交通") return "transport";
  return "other";
}

function buildFootprintDays(locations, summaries) {
  const groups = [];
  const groupMap = {};
  (locations || []).forEach((location) => {
    const summary = (summaries || []).find((item) => item.name === location.name);
    const category = location.category || summary && summary.category || "其他";
    const date = location.date || "";
    if (!groupMap[date]) {
      groupMap[date] = { date, items: [] };
      groups.push(groupMap[date]);
    }
    const group = groupMap[date];
    group.items.push({
      ...location,
      category,
      iconType: iconTypeForCategory(category)
    });
  });
  let trackIndex = 0;
  return groups.map((group, index) => ({
    ...group,
    dayLabel: "DAY " + (index + 1),
    dateLabel: formatDayLabel(group.date),
    items: group.items.map((item) => {
      const itemIndex = trackIndex;
      trackIndex += 1;
      const bendDirection = itemIndex ? (itemIndex % 2 ? -1 : 1) : -1;
      return {
        ...item,
        pinLeft: [48, 54, 47, 56, 49, 53][itemIndex % 6],
        sideClass: bendDirection < 0 ? "place-right" : "place-left"
      };
    })
  }));
}

function drawFootprintRoute(page) {
  if (!page.data.report || !page.data.report.footprintDays || !page.data.report.footprintDays.length) return;
  wx.createSelectorQuery().in(page)
    .select("#footprint-route-canvas").fields({ node: true, size: true })
    .select("#footprint-route-canvas").boundingClientRect()
    .selectAll(".place-pin").boundingClientRect()
    .exec((result) => {
      const canvasInfo = result && result[0];
      const canvasRect = result && result[1];
      const pins = result && result[2] || [];
      if (!canvasInfo || !canvasInfo.node || !canvasRect || pins.length < 2) return;
      const canvas = canvasInfo.node;
      const pixelRatio = wx.getSystemInfoSync().pixelRatio || 1;
      const width = canvasInfo.width || 1;
      const height = canvasInfo.height || 1;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      const context = canvas.getContext("2d");
      context.scale(pixelRatio, pixelRatio);
      context.clearRect(0, 0, width, height);
      context.beginPath();
      pins.forEach((pin, index) => {
        const x = pin.left + pin.width / 2 - canvasRect.left;
        const y = pin.top + pin.height / 2 - canvasRect.top;
        if (!index) {
          context.moveTo(x, y);
          return;
        }
        const previous = pins[index - 1];
        const previousX = previous.left + previous.width / 2 - canvasRect.left;
        const previousY = previous.top + previous.height / 2 - canvasRect.top;
        const distanceY = y - previousY;
        const bend = (index % 2 ? -1 : 1) * Math.max(18, Math.min(42, Math.abs(x - previousX) + 18));
        context.bezierCurveTo(previousX + bend, previousY + distanceY * 0.42, x + bend, y - distanceY * 0.42, x, y);
      });
      context.setLineDash([5, 7]);
      context.lineWidth = 1.6;
      context.lineCap = "round";
      context.strokeStyle = "#376fb5";
      context.stroke();
    });
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
    categories: categories.map((item, index) => ({ ...item, ratioText: Math.round(item.ratio * 100) + "%", color: palette[index % palette.length] })),
    locations: (report.locations || []).map((item) => ({ ...item, shortDate: formatShortDate(item.date) })),
    summaries: (report.summaries || []).map((item) => ({ ...item, categoryLabel: item.category || "其他" })),
    footprintDays: buildFootprintDays(report.locations || [], report.summaries || [])
  };
}

function drawCategoryPie(page) {
  const categories = page.data.report && page.data.report.categories || [];
  if (!categories.length) return;
  wx.createSelectorQuery().in(page).select("#category-pie").fields({ node: true, size: true }).exec((result) => {
    const canvasInfo = result && result[0];
    if (!canvasInfo || !canvasInfo.node) return;
    const canvas = canvasInfo.node;
    const size = Math.min(canvasInfo.width || 220, canvasInfo.height || 220);
    const pixelRatio = wx.getSystemInfoSync().pixelRatio || 1;
    canvas.width = size * pixelRatio;
    canvas.height = size * pixelRatio;
    const context = canvas.getContext("2d");
    context.scale(pixelRatio, pixelRatio);
    context.clearRect(0, 0, size, size);
    const center = size / 2;
    const radius = size / 2 - 4;
    let startAngle = -Math.PI / 2;
    categories.forEach((item) => {
      const endAngle = startAngle + Math.PI * 2 * Number(item.ratio || 0);
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, startAngle, endAngle);
      context.closePath();
      context.fillStyle = item.color;
      context.fill();
      startAngle = endAngle;
    });
  });
}

Page({
  data: { deleting: false },
  async onLoad(options) {
    this.tripId = options && options.trip;
    const result = await Promise.resolve(services.getPersonalReport(this.tripId));
    const report = result.ok ? decorateReport(result.data) : decorateReport({ title: "报告暂不可见", lead: result.error.message, totalText: "¥0.00", count: 0, averageText: "¥0.00", daily: [], categories: [], summaries: [], locations: [] });
    this.setData({ report, error: result.ok ? "" : result.error.message }, () => {
      drawCategoryPie(this);
      drawFootprintRoute(this);
    });
  },
  onReady() {
    drawFootprintRoute(this);
  },
  deleteReport() {
    if (!this.data.report || !this.data.report.canDelete || this.data.deleting) return;
    wx.showModal({
      title: "删除历史行程",
      content: "你的报告和这段历史行程将被删除，且无法恢复。确定删除吗？",
      confirmText: "删除",
      cancelText: "取消",
      success: async ({ confirm }) => {
        if (!confirm) return;
        this.setData({ deleting: true });
        wx.showLoading({ title: "正在删除" });
        const result = await Promise.resolve(services.deletePersonalReport(this.tripId));
        wx.hideLoading();
        if (!result.ok) {
          this.setData({ deleting: false });
          wx.showToast({ title: result.error.message, icon: "none" });
          return;
        }
        wx.showToast({ title: "我的报告已删除", icon: "none" });
        wx.reLaunch({ url: "/pages/home/index" });
      }
    });
  },
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/home/index" });
  }
});

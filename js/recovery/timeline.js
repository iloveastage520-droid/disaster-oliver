const TIMELINE_STEPS = [
  { time: "15:00", label: "彙整各單位回報" },
  { time: "16:00", label: "整併道路清理進度" },
  { time: "17:00", label: "檢核較早完成路段" },
  { time: "18:00", label: "追蹤預計完成路段" }
];

export function renderTimeline() {
  const track = document.querySelector("#recovery-timeline-track");
  if (!track) return;

  track.replaceChildren(...TIMELINE_STEPS.map((step, index) => {
    const item = document.createElement("article");
    item.className = "timeline-step";

    const time = document.createElement("strong");
    time.textContent = step.time;

    const label = document.createElement("span");
    label.textContent = step.label;

    item.append(time, label);

    if (index < TIMELINE_STEPS.length - 1) {
      const arrow = document.createElement("span");
      arrow.className = "timeline-arrow";
      arrow.textContent = "↓";
      item.append(arrow);
    }

    return item;
  }));
}

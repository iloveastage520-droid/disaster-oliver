(function () {
  const panel = document.querySelector(".cesium-control-panel");
  const button = document.querySelector(".cesium-panel-toggle");
  if (!panel || !button) return;

  const setCollapsed = (collapsed) => {
    panel.classList.toggle("is-collapsed", collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.textContent = collapsed ? "控制" : "收合";
  };

  setCollapsed(true);
  button.addEventListener("click", () => {
    setCollapsed(!panel.classList.contains("is-collapsed"));
  });
})();

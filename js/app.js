const statusLabels = document.querySelectorAll(".status-grid strong");

statusLabels.forEach((label) => {
  label.dataset.state = "placeholder";
});

console.info("Disaster Oliver initialized.");

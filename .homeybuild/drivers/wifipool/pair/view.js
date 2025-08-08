Homey.on('init', () => {
  const nextBtn = document.getElementById('next');
  nextBtn.addEventListener('click', () => {
    Homey.showView('list_devices');
  });
});

Homey.on('init', () => {
  console.log('Pairing: start view initialized');
  const nextBtn = document.getElementById('next');
  nextBtn.addEventListener('click', () => {
    console.log('Pairing: next button clicked, showing device list');
    Homey.showView('list_devices');
  });
});

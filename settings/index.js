function onHomeyReady(Homey) {
  window.Homey = Homey;

  const emailField = document.getElementById('email');
  const passwordField = document.getElementById('password');
  const form = document.getElementById('credentials-form');

  Homey.get('email', (err, value) => {
    if (!err && value) emailField.value = value;
  });

  Homey.get('password', (err, value) => {
    if (!err && value) passwordField.value = value;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    Homey.set('email', emailField.value, (err) => {
      if (err) return Homey.alert(err.message || err.toString());
      Homey.set('password', passwordField.value, (err2) => {
        if (err2) return Homey.alert(err2.message || err2.toString());
        Homey.alert('Settings saved');
      });
    });
  });

  Homey.ready();
}

async function onHomeyReady(Homey) {
  window.Homey = Homey;

  const emailField = document.getElementById('email');
  const passwordField = document.getElementById('password');
  const ipField = document.getElementById('api_ip');
  const form = document.getElementById('credentials-form');

  try {
    const email = await Homey.get('email');
    if (email) emailField.value = email;
  } catch (err) {
    // Ignore missing email setting
  }

  try {
    const password = await Homey.get('password');
    if (password) passwordField.value = password;
  } catch (err) {
    // Ignore missing password setting
  }

  try {
    const apiIp = await Homey.get('api_ip');
    if (apiIp) ipField.value = apiIp;
  } catch (err) {
    // Ignore missing api_ip setting
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Homey.set('email', emailField.value);
      await Homey.set('password', passwordField.value);
      await Homey.set('api_ip', ipField.value);
      Homey.alert('Settings saved');
    } catch (err) {
      Homey.alert(err.message || err.toString());
    }
  });

  Homey.ready();
}

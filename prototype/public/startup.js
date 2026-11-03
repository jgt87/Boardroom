// Startup message shown before the app loads (kept out of index.html for the Content Security Policy).
(function () {
  var title = document.querySelector('#startup h1'),
    message = document.getElementById('startup-message');
  if (!title || !message) return;
  function show(heading, text) {
    if (!document.getElementById('startup')) return; // the app has started
    title.textContent = heading;
    message.textContent = text;
  }
  if (location.protocol === 'file:') {
    show(
      'Open Boardroom through its local server',
      'This React project cannot run by opening its HTML file directly. The development server is at the link below. If it is not running, open a terminal in the prototype folder and run npm run dev.',
    );
    document.getElementById('startup-link').hidden = false;
    return;
  }
  // Report a real failure as soon as it happens: a script that fails to load or an error during start-up.
  var failed = false;
  function fail(detail) {
    if (failed || !document.getElementById('startup')) return;
    failed = true;
    show(
      'The editor could not finish loading',
      'Reload this page with Ctrl+Shift+R. If this message remains, the application failed to start' +
        (detail ? ': ' + detail : '.'),
    );
  }
  addEventListener(
    'error',
    function (e) {
      if (e.target && e.target.tagName === 'SCRIPT') fail('a script could not be loaded.');
      else if (e.message) fail(e.message);
    },
    true,
  );
  addEventListener('unhandledrejection', function (e) {
    fail(e.reason && e.reason.message ? e.reason.message : '');
  });
  // A first load from another machine on the development server can take a while: say so, but do not give up.
  setTimeout(function () {
    if (!failed)
      show('Opening Boardroom…', 'Still loading. The first visit from another device can take up to a minute.');
  }, 8000);
  setTimeout(function () {
    fail('loading took longer than 90 seconds.');
  }, 90000);
})();

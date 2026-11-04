// Start-up screen behaviour before the app loads (kept out of index.html for the Content Security Policy).
// States are classes on #startup, styled in startup.css: is-slow (still loading), is-error (failed, offers
// Reload) and is-file (opened as a file, offers the server link).
(function () {
  var root = document.getElementById('startup'),
    title = document.querySelector('#startup h1'),
    message = document.getElementById('startup-message'),
    reload = document.getElementById('startup-reload');
  if (!root || !title || !message) return;
  function show(state, heading, text) {
    if (!document.getElementById('startup')) return; // the app has started
    root.className = state;
    title.textContent = heading;
    message.textContent = text;
  }
  if (reload)
    reload.addEventListener('click', function () {
      location.reload();
    });
  if (location.protocol === 'file:') {
    show(
      'is-file',
      'Open Boardroom through its local server',
      'This page cannot run from its HTML file directly. Use the link below. If nothing opens, run npm run dev in the prototype folder first.',
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
      'is-error',
      'Boardroom could not finish loading',
      'Try reloading. If this keeps happening, the app failed to start' + (detail ? ': ' + detail : '.'),
    );
    if (reload) reload.focus();
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
      show(
        'is-slow',
        'Still opening…',
        'The first visit from another device can take up to a minute. Your boards are safe.',
      );
  }, 8000);
  setTimeout(function () {
    fail('loading took longer than 90 seconds.');
  }, 90000);
})();

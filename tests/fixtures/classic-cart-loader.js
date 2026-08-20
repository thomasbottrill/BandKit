window.fixtureCartAutosaveReady = fetch(`/dist/unpacked/cart-autosave.js${location.search}`)
  .then((response) => response.text())
  .then((source) => eval(source));

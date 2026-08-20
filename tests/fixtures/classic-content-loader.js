window.fixtureCartAutosaveReady.then(() => fetch(`/dist/unpacked/content.js${location.search}`))
  .then((response) => response.text())
  .then((source) => {
    eval(source.replaceAll("chrome.", "fixtureChrome."));
    document.documentElement.dataset.contentLoaded = "true";
  })
  .catch((error) => {
    document.documentElement.dataset.contentLoaded = "error";
    document.documentElement.dataset.fixtureError = String(error);
  });

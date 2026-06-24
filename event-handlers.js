// Wait for the DC component to be ready and expose event handlers globally
(function () {
  let componentInstance = null;

  // Temporary stubs to prevent ReferenceError until component is ready
  window.onMove = function (e) {
    if (componentInstance && componentInstance.onMove) {
      componentInstance.onMove.call(componentInstance, e);
    }
  };

  window.onLeave = function () {
    if (componentInstance && componentInstance.onLeave) {
      componentInstance.onLeave.call(componentInstance);
    }
  };

  // Try to capture the component instance
  function setupHandlers() {
    try {
      // Look for the DC component in the DOM
      const xDcElement = document.querySelector("x-dc");
      if (xDcElement && xDcElement.__component) {
        componentInstance = xDcElement.__component;
      }

      // If component not found, try again
      if (!componentInstance) {
        requestAnimationFrame(setupHandlers);
      }
    } catch (err) {
      console.warn("Could not capture component instance:", err);
      requestAnimationFrame(setupHandlers);
    }
  }

  // Start looking for the component when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupHandlers);
  } else {
    setupHandlers();
  }
})();

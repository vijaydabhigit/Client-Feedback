/*!
 * Client Feedback loader (MIT licence). Pages include this file; it never needs to change.
 * It loads widget.js with a fresh version number every minute, so updates to widget.js
 * show up straight away even when the hosting (e.g. SiteGround) caches .js files.
 */
(function () {
  var me = document.currentScript;
  if (!me) { var all = document.querySelectorAll('script[src*="feedback.js"]'); me = all[all.length - 1]; }
  if (!me || window.__nlFeedbackLoader) return;
  window.__nlFeedbackLoader = true;
  var s = document.createElement('script');
  s.src = me.src.replace(/feedback\.js(\?.*)?$/, '') + 'widget.js?v=' + Math.floor(Date.now() / 60000);
  s.defer = true;
  for (var i = 0; i < me.attributes.length; i++) {
    var a = me.attributes[i];
    if (a.name.indexOf('data-') === 0) s.setAttribute(a.name, a.value); // pass on options
  }
  (document.head || document.documentElement).appendChild(s);
})();

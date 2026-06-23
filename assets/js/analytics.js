/* =====================================================================
   ЯНДЕКС.МЕТРИКА — подключается автоматически, если в config.js задан metrikaId.
   Пусто — ничего не грузится (никаких лишних запросов).
   Цели (reachGoal) вызываются из app.js через window.reachGoal(...).
   ===================================================================== */
(function () {
  "use strict";
  var id = ((window.CONFIG && CONFIG.metrikaId) || "").toString().replace(/\D/g, "");

  // helper для целей — безопасен, даже если Метрика выключена
  window.reachGoal = function (goal, params) {
    if (id && typeof window.ym === "function") window.ym(id, "reachGoal", goal, params);
  };

  if (!id) return;

  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) return; }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0];
    k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

  ym(id, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
})();

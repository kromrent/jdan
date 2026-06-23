/* =====================================================================
   COOKIE-ПЛАШКА (152-ФЗ): уведомление + согласие. Показывается один раз,
   состояние сохраняется в localStorage. Чистый JS, бэкенд не нужен.
   ===================================================================== */
(function () {
  "use strict";
  var KEY = "atelier_cookie_ok_v1";
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}

  function build() {
    if (!document.body) return;
    var bar = document.createElement("div");
    bar.className = "cookie-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Уведомление об использовании cookie");
    bar.innerHTML =
      '<p class="cookie-text">Мы используем файлы cookie, локальное хранилище браузера (для корзины) ' +
      'и сервисы аналитики. Оставаясь на сайте, вы соглашаетесь с обработкой данных согласно ' +
      '<a href="privacy.html">политике конфиденциальности</a>.</p>' +
      '<button type="button" class="btn btn-primary cookie-accept">Принять</button>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add("show"); });
    bar.querySelector(".cookie-accept").addEventListener("click", function () {
      try { localStorage.setItem(KEY, "1"); } catch (e) {}
      bar.classList.remove("show");
      setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 400);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();

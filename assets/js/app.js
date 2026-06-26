/* =====================================================================
   ЛОГИКА САЙТА: каталог, корзина (localStorage), оформление заказа.
   Данные берутся из config.js (CONFIG) и products.js (PRODUCTS).
   ===================================================================== */
(function () {
  "use strict";

  const CART_KEY = "atelier_cart_v1";
  const cur = CONFIG.currency || "₽";

  /* ---------- утилиты ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function fmtPrice(n) {
    if (!n || n <= 0) return "по запросу";
    return n.toLocaleString("ru-RU") + " " + cur;
  }
  function productById(id) {
    return PRODUCTS.find((p) => p.id === id);
  }
  function priceFor(p, vol) {
    return vol === 5 ? p.price5 : vol === 4 ? p.price4 : p.price3;
  }

  /* ---------- скидка ---------- */
  const DISC = Math.max(0, Math.min(90, Number(CONFIG.discountPercent) || 0));
  function hasDisc() { return DISC > 0; }
  function applyDisc(n) { return Math.round((n * (100 - DISC)) / 100 / 10) * 10; } // округляем до 10 ₽
  // цена, которую реально платит покупатель (со скидкой, если она включена)
  function effPrice(p, vol) {
    const b = priceFor(p, vol);
    return b > 0 && hasDisc() ? applyDisc(b) : b;
  }
  // HTML цены: при скидке — старая зачёркнута + новая; иначе одна цена
  function priceTag(n) {
    if (!n || n <= 0) return `<span class="p-now">по запросу</span>`;
    if (hasDisc()) return `<span class="p-old">${fmtPrice(n)}</span><span class="p-now">${fmtPrice(applyDisc(n))}</span>`;
    return `<span class="p-now">${fmtPrice(n)}</span>`;
  }
  // крупный блок цены под пилюлями (метка объёма + сумма) — обновляется при смене объёма
  function priceBlock(p, vol) {
    return `<span class="cp-vol">${vol} мл</span><span class="cp-amount">${priceTag(priceFor(p, vol))}</span>`;
  }
  // ноты одной строкой: до 4 нот через «·» (верх → сердце → база)
  function inlineNotes(p) {
    const n = p.notes || {};
    const parts = [n.top, n.heart, n.base].filter(Boolean).join(",")
      .split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return "";
    const line = parts.slice(0, 4).join(" · ");
    return line.charAt(0).toUpperCase() + line.slice(1);
  }

  /* =================================================================
     ПОДСТАНОВКА ДАННЫХ ИЗ CONFIG
     ================================================================= */
  function applyConfig() {
    $$("[data-shop-name]").forEach((el) => (el.textContent = CONFIG.shopName));
    $$("[data-shop-tagline]").forEach((el) => (el.textContent = CONFIG.shopTagline));
    document.title = CONFIG.shopName + " — распив нишевой парфюмерии";

    // контакты в футере
    const phone = $("#footPhone");
    if (phone) { phone.textContent = CONFIG.phoneDisplay; phone.href = "tel:+" + CONFIG.phoneRaw; }
    const wa = $("#footWhatsapp");
    if (wa) wa.href = "https://wa.me/" + CONFIG.phoneRaw;
    const tg = $("#footTelegram");
    if (tg) tg.href = "https://t.me/" + CONFIG.telegram;
    const em = $("#footEmail");
    if (em) { em.textContent = CONFIG.email; em.href = "mailto:" + CONFIG.email; }
    // кнопка «Позвонить» в окне оформления заказа
    const callBtn = $("#callPhone");
    if (callBtn) { callBtn.textContent = "Позвонить: " + CONFIG.phoneDisplay; callBtn.href = "tel:+" + CONFIG.phoneRaw; }

    // оплата/доставка
    const dl = $("#deliveryList");
    if (dl) dl.innerHTML = (CONFIG.delivery || []).map((t) => `<li>${esc(t)}</li>`).join("");

    // реквизиты
    const lg = CONFIG.legal || {};
    const box = $("#footerLegal");
    if (box) {
      box.innerHTML =
        "<h4>Реквизиты</h4>" +
        `<p>${esc(lg.fio || "")}</p>` +
        `<p>ИНН: ${esc(lg.inn || "")}</p>` +
        `<p>ОГРНИП: ${esc(lg.ogrnip || "")}</p>` +
        `<p>${esc(lg.address || "")}</p>` +
        (lg.account ? `<p>Р/с: ${esc(lg.account)}</p>` : "") +
        (lg.bankName ? `<p>Банк: ${esc(lg.bankName)}</p>` : "") +
        (lg.bik ? `<p>БИК: ${esc(lg.bik)}</p>` : "") +
        (lg.corrAccount ? `<p>К/с: ${esc(lg.corrAccount)}</p>` : "");
    }
    const copy = $("#footerCopy");
    if (copy) copy.innerHTML = `© ${new Date().getFullYear()} ${esc(CONFIG.shopName)}. Все права защищены.`;

    // плашка-объявление о скидке
    const promo = $("#promoBar");
    if (promo) {
      if (hasDisc()) {
        promo.innerHTML = `Сейчас действует скидка <b>−${DISC}%</b> на весь каталог`;
        promo.hidden = false;
      } else {
        promo.hidden = true;
      }
    }

    // бейдж скидки в hero (показывается только при включённой скидке)
    const heroPromo = $("#heroPromo");
    if (heroPromo) {
      if (hasDisc()) {
        const pct = $("#heroPromoPct");
        if (pct) pct.textContent = "−" + DISC + "%";
        heroPromo.hidden = false;
      } else {
        heroPromo.hidden = true;
      }
    }
  }

  /* =================================================================
     ФИЛЬТРЫ: бренд (1-й ряд) + пол (2-й ряд), работают вместе (И)
     ================================================================= */
  let activeBrand = "Все";
  let activeGender = "Все";
  let searchQuery = "";
  let sortMode = "default";

  // пер-карточный цвет: [свечение на ховере, цвет бренд-лейбла] — свой у каждого аромата (палитра SILLAGE)
  const GLOW = {
    "cc-jump-up": ["#8B9ED6", "#3A4E8E"], "cc-rock-rose": ["#C77A6E", "#7E2E33"], "cc-no1": ["#E3C079", "#A87B28"],
    "cc-iconic-feminine": ["#7FB3B8", "#2F6B73"], "cc-cosmos-flower": ["#C77A8E", "#5A2E33"],
    "penhaligons-constance": ["#C2A06A", "#7A5A38"], "byredo-oud-immortel": ["#CDBFA8", "#8A6A4A"],
    "byredo-mixed-emotions": ["#C2BBAE", "#7C7363"], "byredo-bibliotheque": ["#D2B488", "#9A6F3E"],
    "byredo-rose-no-mans-land": ["#D98A90", "#9E3B45"], "max-philip-mandarin": ["#F0B85A", "#D07A1E"],
    "amouage-crimson-rocks": ["#D98A86", "#8A3A30"], "amouage-love-tuberose": ["#E8C9C2", "#C08A7E"],
    "amouage-cristal-gold": ["#E6D6A6", "#C0A24E"], "amouage-reflection-woman": ["#D9B8BE", "#A06C84"],
    "lv-symphony": ["#D8CDBA", "#9A8A6A"], "lv-cosmic-cloud": ["#CFC6B4", "#8E8266"],
    "lv-dancing-blossom": ["#E3C7C0", "#B07A82"], "lv-myriad": ["#DCC9A8", "#A88A5A"],
    "nishane-afrika-olifant": ["#C2A06A", "#6E5A3C"], "nishane-fan-your-flames": ["#7C9A6A", "#3C5A43"],
    "nishane-ani": ["#E0C28A", "#A8833C"], "nishane-wulong-cha-x": ["#D6C98A", "#A98C4C"],
  };
  const glowStyle = (id) => {
    const g = GLOW[id];
    return g ? `--c-glow:${g[0]};--c-ink:${g[1]}` : "";
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function renderFilters() {
    const brands = ["Все", ...Array.from(new Set(PRODUCTS.map((p) => p.brand)))];
    const wrap = $("#filters");
    wrap.innerHTML = brands
      .map((b) => `<button class="filter-chip${b === activeBrand ? " active" : ""}" data-brand="${esc(b)}">${esc(b)}</button>`)
      .join("");
    $$(".filter-chip", wrap).forEach((chip) => {
      chip.addEventListener("click", () => {
        activeBrand = chip.dataset.brand;
        renderFilters();
        renderCatalog();
        revealInit();
      });
    });
  }

  function renderGenderFilters() {
    const wrap = $("#genderFilters");
    if (!wrap) return;
    const genders = ["Все", ...Array.from(new Set(PRODUCTS.map((p) => p.gender).filter(Boolean)))];
    wrap.innerHTML = genders
      .map((g) => `<button class="filter-chip${g === activeGender ? " active" : ""}" data-gender="${esc(g)}">${esc(g === "Все" ? "Все" : cap(g))}</button>`)
      .join("");
    $$(".filter-chip", wrap).forEach((chip) => {
      chip.addEventListener("click", () => {
        activeGender = chip.dataset.gender;
        renderGenderFilters();
        renderCatalog();
        revealInit();
      });
    });
  }

  /* =================================================================
     КАТАЛОГ
     ================================================================= */
  // строка для поиска: бренд + название + все ноты
  function searchHaystack(p) {
    const n = p.notes || {};
    return [p.brand, p.name, n.top, n.heart, n.base].filter(Boolean).join(" ").toLowerCase();
  }

  function renderCatalog() {
    const grid = $("#catalogGrid");
    const q = searchQuery.trim().toLowerCase();
    let list = PRODUCTS.filter(
      (p) => (activeBrand === "Все" || p.brand === activeBrand) &&
             (activeGender === "Все" || p.gender === activeGender) &&
             (!q || searchHaystack(p).indexOf(q) !== -1)
    );

    // сортировка (по цене за 3 мл со скидкой; «по запросу» = 0 уходит в конец)
    if (sortMode === "price-asc" || sortMode === "price-desc") {
      const priceKey = (p) => { const v = effPrice(p, 3); return v > 0 ? v : Infinity; };
      list = list.slice().sort((a, b) =>
        sortMode === "price-asc" ? priceKey(a) - priceKey(b) : priceKey(b) - priceKey(a));
    } else if (sortMode === "name") {
      list = list.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }

    const emptyEl = $("#catalogEmpty");
    if (emptyEl) emptyEl.hidden = list.length > 0;

    grid.innerHTML = list
      .map((p) => {
        const notes = inlineNotes(p);
        return `
        <article class="card reveal" data-id="${esc(p.id)}" style="${glowStyle(p.id)}">
          <div class="card-media">
            ${hasDisc() && p.price3 > 0 ? `<span class="card-sale">−${DISC}%</span>` : ""}
            <span class="card-vol-badge">3 мл</span>
            <img src="${esc(p.img)}" alt="${esc(p.brand)} ${esc(p.name)}" loading="lazy" decoding="async" />
          </div>
          <div class="card-body">
            <div class="card-meta">
              <span class="card-brand">${esc(p.brand)}</span>
              ${p.gender ? `<span class="card-gender">${esc(p.gender)}</span>` : ""}
            </div>
            <h3 class="card-name">${esc(p.name)}</h3>
            ${notes ? `<p class="card-notes-line">${esc(notes)}</p>` : ""}
            <div class="card-buy">
              <div class="vol-toggle" role="group" aria-label="Объём">
                <button class="vol-opt active" data-vol="3"><span class="v">3 мл</span></button>
                <button class="vol-opt" data-vol="4"><span class="v">4 мл</span></button>
                <button class="vol-opt" data-vol="5"><span class="v">5 мл</span></button>
              </div>
              <div class="card-price-row">
                <div class="card-price">${priceBlock(p, 3)}</div>
                <button class="btn add-btn" aria-label="Добавить в корзину"><span class="plus" aria-hidden="true">+</span><span class="add-txt">В корзину</span></button>
              </div>
            </div>
          </div>
        </article>`;
      })
      .join("");

    // обработчики на карточках
    $$(".card", grid).forEach((card) => {
      const id = card.dataset.id;
      const p = productById(id);
      $$(".vol-opt", card).forEach((opt) => {
        opt.addEventListener("click", () => {
          $$(".vol-opt", card).forEach((o) => o.classList.remove("active"));
          opt.classList.add("active");
          const vol = Number(opt.dataset.vol);
          const priceEl = $(".card-price", card);
          if (priceEl && p) priceEl.innerHTML = priceBlock(p, vol);
          const volBadge = $(".card-vol-badge", card);
          if (volBadge) volBadge.textContent = vol + " мл";
        });
      });
      $(".add-btn", card).addEventListener("click", () => {
        const vol = Number($(".vol-opt.active", card).dataset.vol);
        addToCart(id, vol);
      });
      const openP = () => openProduct(id);
      const media = $(".card-media", card);
      const nameEl = $(".card-name", card);
      if (media) media.addEventListener("click", openP);
      if (nameEl) nameEl.addEventListener("click", openP);
    });
  }

  /* =================================================================
     МОДАЛКА ТОВАРА
     ================================================================= */
  const productModal = $("#productModal");

  function notesRows(p) {
    const n = p.notes || {};
    const row = (label, val) => val ? `<div class="pm-note-row"><b>${label}</b><span>${esc(val)}</span></div>` : "";
    const rows = row("Верх", n.top) + row("Сердце", n.heart) + row("База", n.base);
    return rows ? `<div class="pm-notes">${rows}</div>` : "";
  }

  function openProduct(id) {
    const p = productById(id);
    if (!p || !productModal) return;
    const body = $("#productBody");
    body.innerHTML =
      `<div class="pm-media">
        ${hasDisc() && p.price3 > 0 ? `<span class="card-sale">−${DISC}%</span>` : ""}
        <img src="${esc(p.img)}" alt="${esc(p.brand)} ${esc(p.name)}" loading="lazy" decoding="async" />
      </div>
      <div class="pm-info">
        <span class="pm-brand">${esc(p.brand)}</span>
        <h3 class="pm-name" id="pmName">${esc(p.name)}</h3>
        ${p.gender ? `<div class="pm-gender">${esc(p.gender)}</div>` : ""}
        ${p.desc ? `<p class="pm-desc">${esc(p.desc)}</p>` : ""}
        ${notesRows(p)}
        <div class="pm-buy">
          <div class="vol-toggle" role="group" aria-label="Объём">
            <button class="vol-opt active" data-vol="3"><span class="v">3 мл</span></button>
            <button class="vol-opt" data-vol="4"><span class="v">4 мл</span></button>
            <button class="vol-opt" data-vol="5"><span class="v">5 мл</span></button>
          </div>
          <div class="pm-price-row">
            <div class="card-price">${priceBlock(p, 3)}</div>
            <button class="btn btn-primary pm-add">В корзину</button>
          </div>
        </div>
      </div>`;

    let selVol = 3;
    $$(".vol-opt", body).forEach((opt) => {
      opt.addEventListener("click", () => {
        $$(".vol-opt", body).forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        selVol = Number(opt.dataset.vol);
        const priceEl = $(".card-price", body);
        if (priceEl) priceEl.innerHTML = priceBlock(p, selVol);
      });
    });
    $(".pm-add", body).addEventListener("click", () => { addToCart(p.id, selVol); closeProduct(); openCart(); });

    productModal.classList.add("open");
    productModal.setAttribute("aria-hidden", "false");
    lockScroll(true);
  }
  function closeProduct() {
    if (!productModal) return;
    productModal.classList.remove("open");
    productModal.setAttribute("aria-hidden", "true");
    lockScroll(false);
  }

  /* =================================================================
     КОРЗИНА
     ================================================================= */
  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }
  let cart = loadCart();

  function addToCart(id, vol) {
    const key = id + "_" + vol;
    const found = cart.find((i) => i.key === key);
    if (found) found.qty += 1;
    else cart.push({ key, id, vol, qty: 1 });
    saveCart(cart);
    updateCartUI();
    toast("Добавлено в корзину");
    if (window.reachGoal) window.reachGoal("add_to_cart");
  }
  function changeQty(key, delta) {
    const it = cart.find((i) => i.key === key);
    if (!it) return;
    it.qty += delta;
    if (it.qty <= 0) cart = cart.filter((i) => i.key !== key);
    saveCart(cart);
    updateCartUI();
  }
  function removeItem(key) {
    cart = cart.filter((i) => i.key !== key);
    saveCart(cart);
    updateCartUI();
  }
  // смена объёма позиции прямо в корзине (если такой объём уже есть — объединяем)
  function changeVol(key, newVol) {
    const it = cart.find((i) => i.key === key);
    if (!it || it.vol === newVol) return;
    const newKey = it.id + "_" + newVol;
    const existing = cart.find((i) => i.key === newKey);
    if (existing) { existing.qty += it.qty; cart = cart.filter((i) => i.key !== key); }
    else { it.vol = newVol; it.key = newKey; }
    saveCart(cart);
    updateCartUI();
  }

  function cartTotals() {
    let total = 0, unknown = 0, count = 0;
    cart.forEach((i) => {
      const p = productById(i.id);
      if (!p) return;
      count += i.qty;
      const pr = effPrice(p, i.vol);
      if (pr > 0) total += pr * i.qty;
      else unknown += i.qty;
    });
    return { total, unknown, count };
  }

  function updateCartUI() {
    const { total, unknown, count } = cartTotals();
    const countEl = $("#cartCount");
    countEl.textContent = count;
    countEl.hidden = count === 0;
    const fabCount = $("#cartFabCount");
    if (fabCount) { fabCount.textContent = count; fabCount.hidden = count === 0; }

    const itemsEl = $("#cartItems");
    const emptyEl = $("#cartEmpty");
    const checkoutBtn = $("#checkoutBtn");

    if (cart.length === 0) {
      itemsEl.innerHTML = "";
      emptyEl.style.display = "flex";
      checkoutBtn.disabled = true;
    } else {
      emptyEl.style.display = "none";
      checkoutBtn.disabled = false;
      itemsEl.innerHTML = cart
        .map((i) => {
          const p = productById(i.id);
          if (!p) return "";
          const pr = effPrice(p, i.vol);
          const lineSum = pr > 0 ? fmtPrice(pr * i.qty) : "по запросу";
          return `
          <div class="cart-item">
            <img src="${esc(p.img)}" alt="" loading="lazy" />
            <div class="cart-item-info">
              <div class="cart-item-brand">${esc(p.brand)}</div>
              <div class="cart-item-name">${esc(p.name)}</div>
              <div class="cart-item-vols" role="group" aria-label="Объём">
                ${[3, 4, 5].map((v) => `<button data-act="vol" data-key="${esc(i.key)}" data-vol="${v}" class="civol${v === i.vol ? " on" : ""}" aria-pressed="${v === i.vol}">${v} мл</button>`).join("")}
              </div>
              <div class="cart-item-bottom">
                <div class="qty">
                  <button data-act="dec" data-key="${esc(i.key)}" aria-label="Меньше">−</button>
                  <span>${i.qty}</span>
                  <button data-act="inc" data-key="${esc(i.key)}" aria-label="Больше">+</button>
                </div>
                <div class="cart-item-price">${lineSum}</div>
              </div>
              <button class="cart-item-remove" data-act="rm" data-key="${esc(i.key)}">убрать</button>
            </div>
          </div>`;
        })
        .join("");

      $$("[data-act]", itemsEl).forEach((btn) => {
        const key = btn.dataset.key;
        btn.addEventListener("click", () => {
          if (btn.dataset.act === "inc") changeQty(key, 1);
          else if (btn.dataset.act === "dec") changeQty(key, -1);
          else if (btn.dataset.act === "vol") changeVol(key, Number(btn.dataset.vol));
          else removeItem(key);
        });
      });
    }

    $("#cartTotal").textContent = fmtPrice(total) === "по запросу" && total === 0 ? "0 " + cur : fmtPrice(total);
    $("#cartPriceHint").hidden = unknown === 0;
  }

  /* ---------- блокировка прокрутки фона при открытых слоях ---------- */
  let scrollLocks = 0;
  function lockScroll(on) {
    scrollLocks = Math.max(0, scrollLocks + (on ? 1 : -1));
    document.body.classList.toggle("no-scroll", scrollLocks > 0);
  }

  /* ---------- открытие/закрытие корзины ---------- */
  const overlay = $("#overlay");
  const drawer = $("#cartDrawer");

  function openCart() {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    overlay.hidden = false;
    lockScroll(true);
  }
  function closeCart() {
    if (!drawer.classList.contains("open")) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    overlay.hidden = true;
    lockScroll(false);
  }

  /* =================================================================
     ОФОРМЛЕНИЕ ЗАКАЗА
     ================================================================= */
  const modal = $("#checkoutModal");

  function openCheckout() {
    if (cart.length === 0) return;
    // показываем состав заказа, чтобы покупатель назвал его по телефону (форму с ПДн не собираем)
    const orderEl = $("#checkoutOrder");
    if (orderEl) {
      const { lines, totalStr } = orderLines();
      orderEl.innerHTML =
        lines.map((l) => `<div class="co-line">${esc(l)}</div>`).join("") +
        `<div class="co-total">${esc(totalStr)}</div>`;
    }
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    lockScroll(true);
  }
  function closeCheckout() {
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    lockScroll(false);
  }

  function orderLines() {
    const { total, unknown } = cartTotals();
    const lines = cart.map((i, idx) => {
      const p = productById(i.id);
      const pr = effPrice(p, i.vol);
      const sum = pr > 0 ? fmtPrice(pr * i.qty) : "по запросу";
      return `${idx + 1}. ${p.brand} — ${p.name} · ${i.vol} мл × ${i.qty} — ${sum}`;
    });
    let totalStr = `Итого: ${fmtPrice(total)}`;
    if (unknown > 0) totalStr += ` (+ ${unknown} поз. по запросу)`;
    return { lines, totalStr };
  }

  function buildOrderText(data, opts) {
    opts = opts || {};
    const { lines, totalStr } = orderLines();
    let txt = `Заказ с сайта «${CONFIG.shopName}»\n\n`;
    if (!opts.callbackOnly) {
      txt += lines.join("\n") + "\n\n" + totalStr + "\n";
      if (hasDisc()) txt += `(цены с учётом скидки −${DISC}%)\n`;
      txt += "\n";
    }
    txt += `Имя: ${data.name}\nТелефон: ${data.phone}`;
    if (data.address) txt += `\nАдрес: ${data.address}`;
    if (data.comment) txt += `\nКомментарий: ${data.comment}`;
    if (opts.callbackOnly) txt += `\n\nПрошу перезвонить для оформления заказа.`;
    return txt;
  }

  function readForm() {
    const f = $("#checkoutForm");
    const val = (n) => (f.querySelector('[name="' + n + '"]') || {}).value || "";
    const chk = (n) => { const el = f.querySelector('[name="' + n + '"]'); return !!(el && el.checked); };
    return {
      name: val("name").trim(),
      phone: val("phone").trim(),
      address: val("address").trim(),
      comment: val("comment").trim(),
      agreePdn: chk("agreePdn"),
      agreeOffer: chk("agreeOffer"),
    };
  }
  function validate(data) {
    const err = $("#formError");
    if (!data.name) return showErr("Укажите имя.");
    if (!data.phone || data.phone.replace(/\D/g, "").length < 5) return showErr("Укажите корректный телефон.");
    if (!data.agreePdn) return showErr("Нужно согласие на обработку персональных данных.");
    if (!data.agreeOffer) return showErr("Нужно согласие с условиями оферты.");
    err.hidden = true;
    return true;
    function showErr(m) { err.textContent = m; err.hidden = false; return false; }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    return new Promise((resolve) => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); resolve();
    });
  }

  function buildSendButtons() {
    const wrap = $("#sendButtons");
    const ch = CONFIG.channels || {};
    const btns = [];
    if (ch.whatsapp) btns.push(`<button type="button" class="btn send-wa" data-ch="whatsapp">WhatsApp</button>`);
    if (ch.telegram) btns.push(`<button type="button" class="btn send-tg" data-ch="telegram">Telegram</button>`);
    if (ch.email) btns.push(`<button type="button" class="btn send-email" data-ch="email">На почту</button>`);
    if (ch.callback) btns.push(`<button type="button" class="btn send-call" data-ch="callback">Заказать звонок</button>`);
    wrap.innerHTML = btns.join("");

    $$("[data-ch]", wrap).forEach((b) => {
      b.addEventListener("click", () => handleSend(b.dataset.ch));
    });
  }

  function handleSend(channel) {
    const data = readForm();
    if (!validate(data)) return;

    if (channel === "whatsapp") {
      const text = buildOrderText(data);
      window.open("https://wa.me/" + CONFIG.phoneRaw + "?text=" + encodeURIComponent(text), "_blank");
      afterSend();
    } else if (channel === "telegram") {
      const text = buildOrderText(data);
      copyToClipboard(text).then(() => {
        window.open("https://t.me/" + CONFIG.telegram, "_blank");
        toast("Текст заказа скопирован — вставьте его в чат Telegram");
        afterSend();
      });
    } else if (channel === "email") {
      sendEmail(data, false);
    } else if (channel === "callback") {
      sendEmail(data, true);
    }
  }

  function sendEmail(data, callbackOnly) {
    const text = buildOrderText(data, { callbackOnly });
    const subject = (callbackOnly ? "Заказ звонка — " : "Заказ с сайта — ") + CONFIG.shopName;

    if (CONFIG.formspreeEndpoint) {
      fetch(CONFIG.formspreeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ subject, name: data.name, phone: data.phone, address: data.address, comment: data.comment, order: text }),
      })
        .then((r) => {
          if (r.ok) { toast("Заявка отправлена! Мы свяжемся с вами."); afterSend(true); }
          else mailtoFallback(subject, text);
        })
        .catch(() => mailtoFallback(subject, text));
    } else {
      mailtoFallback(subject, text);
    }
  }
  function mailtoFallback(subject, text) {
    window.location.href = "mailto:" + CONFIG.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text);
    afterSend();
  }

  function afterSend(clear) {
    if (clear) { cart = []; saveCart(cart); updateCartUI(); }
    if (window.reachGoal) window.reachGoal("order");
    closeCheckout();
    closeCart();
  }

  /* =================================================================
     ТОСТ
     ================================================================= */
  let toastTimer;
  function toast(msg) {
    let el = $(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1500);
  }

  /* =================================================================
     АНИМАЦИИ ПОЯВЛЕНИЯ
     ================================================================= */
  let observer;
  function revealInit() {
    if (!("IntersectionObserver" in window)) {
      $$(".reveal").forEach((el) => el.classList.add("in"));
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("in"); observer.unobserve(e.target); }
        });
      }, { threshold: 0.12 });
    }
    $$(".reveal:not(.in)").forEach((el) => observer.observe(el));
  }

  /* =================================================================
     ИНИЦИАЛИЗАЦИЯ
     ================================================================= */
  function init() {
    applyConfig();
    renderFilters();
    renderGenderFilters();
    renderCatalog();
    updateCartUI();
    revealInit();

    $("#cartBtn").addEventListener("click", openCart);

    // плавающая корзина: открытие по клику + появление при прокрутке вниз
    const fab = $("#cartFab");
    if (fab) {
      fab.addEventListener("click", openCart);
      const onScroll = () => fab.classList.toggle("show", window.scrollY > 420);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    $("#cartClose").addEventListener("click", closeCart);
    $("#checkoutBtn").addEventListener("click", () => { closeCart(); openCheckout(); });
    $("#checkoutClose").addEventListener("click", closeCheckout);
    overlay.addEventListener("click", closeCart);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeCheckout(); });

    // модалка товара
    const productClose = $("#productClose");
    if (productClose) productClose.addEventListener("click", closeProduct);
    if (productModal) productModal.addEventListener("click", (e) => { if (e.target === productModal) closeProduct(); });

    // поиск по каталогу
    const searchInput = $("#catalogSearch");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        renderCatalog();
        revealInit();
      });
    }
    // сортировка
    const sortSelect = $("#catalogSort");
    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        sortMode = sortSelect.value;
        renderCatalog();
        revealInit();
      });
    }

    // бургер-меню (мобильная навигация)
    const navToggle = $("#navToggle");
    const mainNav = $("#mainNav");
    if (navToggle && mainNav) {
      const setNav = (open) => {
        mainNav.classList.toggle("open", open);
        navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      };
      navToggle.addEventListener("click", () => setNav(!mainNav.classList.contains("open")));
      $$("a", mainNav).forEach((a) => a.addEventListener("click", () => setNav(false)));
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeCart(); closeCheckout(); closeProduct(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

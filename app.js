/* Калькулятор сметы ремонта — логика. Обычно этот файл не нужно трогать. */
// Все настройки клиента (бренд и цены) — в config.js
const CONFIG = window.CALC_CONFIG;
const BRAND = CONFIG.brand;

const ICONS = {
  building: '<path d="M6 30V7l12-3v26M18 12l12 3v15M3 30h30M10 11h3M10 16h3M10 21h3M22 18h3M22 23h3"/>',
  box: '<path d="M18 4 31 10v16l-13 6-13-6V10Z M5 10l13 6 13-6M18 16v16"/>',
  home: '<path d="M4 16 18 5l14 11M8 13v17h20V13M15 30v-9h6v9"/>',
  brush: '<path d="M24 4 32 12 18 26l-8-8Z M10 18c-4 0-6 3-6 6s-1 5-2 6c6 0 12-1 12-6"/>',
  hammer: '<path d="M14 6h12l4 4-4 2-3-2h-3v4l-14 16-4-4 14-16V6"/>',
  compass: '<circle cx="18" cy="6" r="3"/><path d="M16.5 8.5 8 32M19.5 8.5 28 32M11 24c4 2 10 2 14 0"/>',
};
const UNIT = { m2: "₽/м²", bath: "₽ за санузел", room: "₽ за комнату", fix: "₽" };

const state = {
  ...CONFIG.defaults,
  extras: new Set(CONFIG.defaults.extras),
};

const $ = (s, r = document) => r.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ");
const round = (n, step = 1000) => Math.round(n / step) * step;
const byId = (list, id) => list.find((x) => x.id === id);
const plural = (n, [one, few, many]) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/* ---------- Отрисовка опций ---------- */
function renderOptions() {
  $('[data-group="city"]').innerHTML = CONFIG.cities.map((c) => radio("city", c.id, `<span class="chip">${c.name}</span>`)).join("");

  $('[data-group="housing"]').innerHTML = CONFIG.housing.map((h) => {
    const note = h.addWork ? `+${fmt(h.addWork)} ₽/м² черновые` : h.demolition ? `+${fmt(h.demolition)} ₽/м² демонтаж` : `−${Math.round((1 - h.workK) * 100)}% к работам`;
    return radio("housing", h.id, card(h, note));
  }).join("");

  $('[data-group="repair"]').innerHTML = CONFIG.repair.map((r) => radio("repair", r.id, card(r, `от ${fmt(r.work)} ₽/м²`))).join("");

  $('[data-group="materials"]').innerHTML = CONFIG.materials.map((m) =>
    radio("materials", m.id, `<span class="seg__btn"><b>${m.name}</b><small>${m.hint}</small></span>`)
  ).join("");

  $("#extras").innerHTML = CONFIG.extras.map((e) => `
    <label class="extra" data-extra="${e.id}">
      <input type="checkbox" name="extra" value="${e.id}" ${state.extras.has(e.id) ? "checked" : ""}>
      <span class="extra__box"><svg viewBox="0 0 14 14"><path d="M2.5 7.5 5.5 10.5 11.5 3.5"/></svg></span>
      <span class="extra__body">
        <span class="extra__title">${e.name}<span class="extra__badge" hidden>включено</span></span>
        <span class="extra__price">${e.unit === "fix" ? fmt(e.price) + " ₽" : fmt(e.price) + " " + UNIT[e.unit]}</span>
      </span>
    </label>`).join("");
}

function radio(name, id, inner) {
  return `<label class="opt"><input type="radio" name="${name}" value="${id}" ${state[name] === id ? "checked" : ""}>${inner}</label>`;
}
function card(o, price) {
  return `<span class="card">
    <svg class="card__icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[o.icon]}</svg>
    <span class="card__title">${o.name}</span>
    <span class="card__desc">${o.desc}</span>
    <span class="card__price">${price}</span>
  </span>`;
}

/* ---------- Расчёт ---------- */
function calculate() {
  const city = byId(CONFIG.cities, state.city);
  const house = byId(CONFIG.housing, state.housing);
  const rep = byId(CONFIG.repair, state.repair);
  const mat = byId(CONFIG.materials, state.materials);
  const A = state.area;
  const lines = [];

  let workPerM = rep.work * (house.workK || 1);
  let work = workPerM * A * city.k;
  lines.push([`${rep.name} ремонт, ${A} м²`, work]);

  if (house.addWork) {
    const v = house.addWork * A * city.k;
    work += v; lines.push(["Стяжка и штукатурка", v]);
  }
  if (house.demolition) {
    const v = house.demolition * A * city.k;
    work += v; lines.push(["Демонтаж старой отделки", v]);
  }

  const materials = mat.price * rep.matK * A;
  lines.push([`Материалы «${mat.name}»`, materials]);

  let extra = 0, extraWeeks = 0;
  for (const e of CONFIG.extras) {
    if (!state.extras.has(e.id) || e.includedIn === state.repair) continue;
    const qty = { m2: A, bath: state.baths, room: state.rooms, fix: 1 }[e.unit];
    const k = e.unit === "fix" ? 1 : city.k;
    const v = e.price * qty * k;
    extra += v;
    extraWeeks += e.weeks || 0;
    const q = e.unit === "bath" && qty > 1 ? ` × ${qty}` : e.unit === "room" ? ` × ${qty}` : "";
    lines.push([e.name + q, v]);
  }

  const total = round(work + materials + extra);
  const weeks = Math.ceil(rep.base + A / rep.speed + extraWeeks + (house.addWork ? 2 : 0) + (house.demolition ? 1 : 0));

  return { work, materials, extra, total, weeks, perM: total / A, lines };
}

/* ---------- Обновление интерфейса ---------- */
const shown = { total: 0, dock: 0 };
let rafId = 0;

function animateTo(target) {
  cancelAnimationFrame(rafId);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const from = shown.total;
  const start = performance.now();
  const dur = reduce || document.hidden ? 0 : 520;
  if (!dur) {
    shown.total = target;
    $("#total").textContent = $("#dockTotal").textContent = fmt(target);
    return;
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = dur ? Math.min(1, (now - start) / dur) : 1;
    const v = from + (target - from) * ease(t);
    shown.total = v;
    $("#total").textContent = fmt(v);
    $("#dockTotal").textContent = fmt(v);
    if (t < 1) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
  // Страховка: если вкладка в фоне и кадры не идут, ставим итог сразу
  clearTimeout(animateTo.t);
  animateTo.t = setTimeout(() => {
    if (shown.total !== target) {
      cancelAnimationFrame(rafId);
      shown.total = target;
      $("#total").textContent = $("#dockTotal").textContent = fmt(target);
    }
  }, dur + 150);
}

let last = null;
function update() {
  const r = calculate();
  last = r;

  animateTo(r.total);
  const lo = round(r.total * (1 - CONFIG.spread), 10000);
  const hi = round(r.total * (1 + CONFIG.spread), 10000);
  $("#range").textContent = `Вилка: ${fmt(lo)} – ${fmt(hi)} ₽`;

  setText("#sWork", fmt(round(r.work, 100)) + " ₽");
  setText("#sMat", fmt(round(r.materials, 100)) + " ₽");
  setText("#sExtra", fmt(round(r.extra, 100)) + " ₽");
  setText("#perM", fmt(round(r.perM, 100)) + " ₽");
  setText("#term", `${r.weeks} ${plural(r.weeks, ["неделя", "недели", "недель"])}`);

  const segs = document.querySelectorAll(".bar__seg");
  [r.work, r.materials, r.extra].forEach((v, i) => (segs[i].style.flexGrow = Math.max(v, 0.0001)));
  segs[2].style.display = r.extra > 0 ? "" : "none";

  $("#details").innerHTML = r.lines.map(([n, v]) => `<li><span>${n}</span><span>${fmt(round(v, 100))} ₽</span></li>`).join("");

  // Дизайн-проект входит в дизайнерский ремонт
  document.querySelectorAll(".extra").forEach((el) => {
    const e = byId(CONFIG.extras, el.dataset.extra);
    const inc = e.includedIn === state.repair;
    const input = el.querySelector("input");
    input.disabled = inc;
    input.checked = inc || state.extras.has(e.id);
    el.querySelector(".extra__badge").hidden = !inc;
  });

  drawPlan();
}

function setText(sel, text) {
  const el = $(sel);
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("tick");
  void el.offsetWidth;
  el.classList.add("tick");
}

/* ---------- Схема квартиры ---------- */
function roomAreas() {
  const { rooms, baths, area } = state;
  const bathA = 4.5, kitchenA = Math.max(6, area * 0.14), hallA = Math.max(4, area * 0.12);
  const roomA = Math.max(8, (area - bathA * baths - kitchenA - hallA) / rooms);
  return { bathA, kitchenA, hallA, roomA };
}

function drawPlan() {
  const { rooms, baths, area } = state;
  const hot = new Set(CONFIG.extras.filter((e) => state.extras.has(e.id) && e.plan).map((e) => e.plan));
  const all = hot.has("all");

  const { bathA, kitchenA, hallA, roomA } = roomAreas();

  const W = 600, top = 140, bottom = 94, pad = 3;
  const topItems = [...Array(rooms)].map((_, i) => ({ t: rooms > 1 ? `Комната ${i + 1}` : "Комната", a: roomA, c: "", key: "rooms" }))
    .concat({ t: "Кухня", a: kitchenA, c: "room--kitchen" });
  const bottomItems = [{ t: "Прихожая", a: hallA, c: "room--hall" }]
    .concat([...Array(baths)].map(() => ({ t: "Санузел", a: bathA, c: "room--bath", key: "bath" })));

  const row = (items, y, h) => {
    const sum = items.reduce((s, i) => s + i.a, 0);
    let x = pad;
    return items.map((it, i) => {
      const w = ((W - pad * 2) * it.a) / sum;
      const isHot = all || hot.has(it.key);
      const small = w < 100;
      const label = small ? it.t.replace(/^Комната /, "К").replace("Санузел", "С/у").replace("Прихожая", "Прих.") : it.t;
      const g = `<g style="transform-origin:${x + w / 2}px ${y + h / 2}px;animation-delay:${i * 30}ms">
        <rect class="room ${it.c} ${isHot ? "room--hot" : ""}" x="${x}" y="${y}" width="${w}" height="${h}"/>
        <text x="${x + w / 2}" y="${y + h / 2 - 5}">${label}</text>
        <text class="plan__area" x="${x + w / 2}" y="${y + h / 2 + 17}">${Math.round(it.a)} м²</text>
      </g>`;
      x += w;
      return g;
    }).join("");
  };

  const svg = $("#plan");
  svg.innerHTML = row(topItems, pad, top) + row(bottomItems, pad + top, bottom);
  // Анимируем появление только когда меняется число комнат/санузлов
  const key = `${rooms}-${baths}`;
  svg.classList.toggle("is-new", key !== planKey && planKey !== "");
  planKey = key;
}
let planKey = "";

/* ---------- События ---------- */
function bind() {
  const form = $("#calc");

  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t.type === "radio") state[t.name] = t.value;
    if (t.name === "extra") t.checked ? state.extras.add(t.value) : state.extras.delete(t.value);
    update();
  });

  const area = $("#area");
  const syncArea = () => {
    state.area = +area.value;
    $("#areaOut").textContent = `${state.area} м²`;
    area.style.setProperty("--p", ((area.value - area.min) / (area.max - area.min)) * 100 + "%");
  };
  area.addEventListener("input", () => { syncArea(); update(); });
  syncArea();

  document.querySelectorAll("[data-count]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.count;
      const [min, max] = CONFIG.limits[key];
      state[key] = Math.min(max, Math.max(min, state[key] + +btn.dataset.d));
      syncCounters();
      update();
    });
  });
  syncCounters();

  // Мобильная панель: прячем, когда карточка итога на экране
  const dock = $("#dock");
  new IntersectionObserver(([en]) => dock.classList.toggle("is-hidden", en.isIntersecting), { threshold: 0.25 })
    .observe($(".summary__card"));
  $("#dockBtn").addEventListener("click", () =>
    $(".summary__card").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })
  );

  $("#copyBtn").addEventListener("click", copyEstimate);
  $("#printBtn").addEventListener("click", () => { $(".details").open = true; window.print(); });

  bindLead();
}

function syncCounters() {
  for (const key of ["rooms", "baths"]) {
    const [min, max] = CONFIG.limits[key];
    $(`#${key}Out`).textContent = state[key];
    $(`[data-count="${key}"][data-d="-1"]`).disabled = state[key] <= min;
    $(`[data-count="${key}"][data-d="1"]`).disabled = state[key] >= max;
  }
}

/* ---------- Текст сметы ---------- */
function estimateText() {
  const r = last;
  const city = byId(CONFIG.cities, state.city).name;
  const house = byId(CONFIG.housing, state.housing).name;
  return [
    "Смета ремонта (предварительная)",
    `${city} · ${house}`,
    `${state.area} м² · комнат: ${state.rooms} · санузлов: ${state.baths}`,
    "",
    ...r.lines.map(([n, v]) => `• ${n} — ${fmt(round(v, 100))} ₽`),
    "",
    `Итого: ${fmt(r.total)} ₽ (${fmt(round(r.perM, 100))} ₽/м²)`,
    `Срок: ~${r.weeks} ${plural(r.weeks, ["неделя", "недели", "недель"])}`,
  ].join("\n");
}

async function copyEstimate() {
  const text = estimateText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  toast("Смета скопирована");
}

let toastT;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("is-on");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("is-on"), 2200);
}

/* ---------- Заявка ---------- */
function bindLead() {
  const modal = $("#modal");
  const phone = $("#leadPhone");
  const err = $("#leadErr");
  const agree = $("#leadAgree");
  const send = $("#leadSend");

  $("#ctaOpen").addEventListener("click", () => { modal.showModal(); });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });

  phone.addEventListener("input", (e) => {
    if (!e.inputType?.startsWith("delete")) phone.value = maskPhone(phone.value);
    if (phone.getAttribute("aria-invalid")) { phone.removeAttribute("aria-invalid"); err.hidden = true; }
  });
  phone.addEventListener("focus", () => { if (!phone.value) phone.value = "+7 "; });
  agree.addEventListener("change", () => (send.disabled = !agree.checked));

  send.addEventListener("click", () => {
    const digits = phone.value.replace(/\D/g, "");
    if (digits.length !== 11) {
      phone.setAttribute("aria-invalid", "true");
      err.hidden = false;
      phone.focus();
      return;
    }
    const name = $("#leadName").value.trim();
    const text = `Заявка на ремонт\n${name ? "Имя: " + name + "\n" : ""}Телефон: ${phone.value}\n\n${estimateText()}`;
    const url = BRAND.telegram
      ? `https://t.me/${BRAND.telegram.replace(/^@/, "")}?text=${encodeURIComponent(text)}`
      : `https://t.me/share/url?url=${encodeURIComponent(location.href.split("#")[0])}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
    modal.close();
    toast("Открываем Telegram…");
  });
}

function maskPhone(v) {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (!d.startsWith("7")) d = "7" + d;
  d = d.slice(0, 11);
  const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
  let out = "+7";
  if (p[0]) out += ` (${p[0]}`;
  if (p[0].length === 3) out += ")";
  if (p[1]) out += ` ${p[1]}`;
  if (p[2]) out += `-${p[2]}`;
  if (p[3]) out += `-${p[3]}`;
  return out;
}

/* ---------- Бренд клиента из config.js ---------- */
function applyBrand() {
  const b = BRAND;
  document.documentElement.style.setProperty("--accent", b.color);
  document.title = `${b.title} ${b.titleAccent} — ${b.name}`;

  document.querySelectorAll("[data-brand]").forEach((el) => {
    const key = el.dataset.brand;
    if (key === "phone") {
      el.hidden = !b.phone;
      el.textContent = b.phone;
      el.href = "tel:" + b.phone.replace(/[^\d+]/g, "");
    } else {
      el.textContent = b[key] || "";
    }
  });

  if (b.logo) {
    const img = Object.assign(document.createElement("img"), { src: b.logo, alt: b.name, className: "logo__img" });
    $(".logo").replaceChildren(img);
  }

  const trust = $("#trust");
  trust.replaceChildren(...b.trust.map(([title, text]) => {
    const d = document.createElement("div");
    d.className = "trust__item";
    d.append(Object.assign(document.createElement("b"), { textContent: title }), Object.assign(document.createElement("span"), { textContent: text }));
    return d;
  }));

  $("#foot").textContent = `© ${new Date().getFullYear()} ${b.name}${b.phone ? " · " + b.phone : ""}`;
}

/* ---------- Старт ---------- */
applyBrand();
renderOptions();
bind();
update();
window.addEventListener("beforeprint", () => ($(".details").open = true));

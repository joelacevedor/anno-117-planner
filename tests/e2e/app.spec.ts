import { test, expect, type Page } from "@playwright/test";

test.use({ locale: "es-ES" });

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
test.afterEach(() => expect(errors).toEqual([]));

const order = (page: Page) => page.locator(".order");
const tab = (page: Page, name: RegExp) => page.getByRole("navigation").getByRole("button", { name });
/** Pestaña del detalle de una cadena (Resumen · Edificios · Flujo · Comercio). */
const view = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
/** Elige de qué isla llega lo que produce un edificio de la cadena. */
async function source(page: Page, building: string, island: string) {
  await view(page, "Edificios");
  const node = page.locator(".node", { hasText: building });
  await node.locator(".supply summary").click();
  await node.getByRole("checkbox", { name: new RegExp(`^${island}`) }).click();
}
/** Abre la página de gestión de islas desde el selector de isla de arriba. */
async function manage(page: Page) {
  await page.locator(".island-pill").click();
  await page.getByRole("button", { name: /Gestionar islas/ }).click();
}
/** Abre el catálogo de cadenas de la región (vista aparte) y busca en él. */
async function catalog(page: Page, q: string) {
  if (!(await page.locator(".catalog-screen").count())) {
    if (!(await page.locator(".catalog-link").count())) await tab(page, /Cadenas/).click();
    await page.locator(".catalog-link").click();
  }
  await page.locator(".catalog-screen").getByPlaceholder(/Buscar/).fill(q);
}
const more = (page: Page) => page.getByRole("button", { name: "Uno más", exact: true });

test("recorrido principal: cadena → edificios enteros → lo que falta", async ({ page }) => {
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo y argamasa" }).click();
  await expect(order(page)).toContainText("Elige cuántos");
  await more(page).click();
  await expect(order(page)).toContainText("Construye 1 patio de obreros");
  await expect(order(page)).toContainText("2 secaderos de barro");
  await expect(order(page)).toContainText("1 recolectoría de junco");
  await expect(page.locator("body")).not.toContainText("1,5");
  await page.getByRole("button", { name: "6", exact: true }).click();
  await expect(order(page)).toContainText("9 secaderos de barro");
  await expect(order(page)).toContainText("6 recolectorías de junco");
  await view(page, "Edificios");
  for (const n of ["Patio de obreros 6", "Recolectoría de junco 6", "Secadero de barro 6"])
    await page.getByRole("button", { name: new RegExp(`^${n}:`) }).click();
  await expect(order(page)).toContainText("Construye 3 secaderos de barro");
  await expect(order(page)).toContainText("Ahora se producen 4 de 6 t/min");
  await page.getByRole("button", { name: /^Secadero de barro 9:/ }).click();
  await expect(order(page)).toContainText("Listo");
});

test("el buscador encuentra cadenas por producto y por edificio", async ({ page }) => {
  await page.locator(".catalog-link").click();
  await expect(page.locator(".chain-card").first()).toBeVisible();
  await catalog(page, "calzado");
  await expect(page.locator(".chain-card")).toHaveCount(0);
  await catalog(page, "zapatos");
  await expect(page.locator(".chain-card", { hasText: "Zapatos de junco" })).toBeVisible();
});

test("obra consolida cadenas que comparten proveedor y persiste al recargar", async ({ page }) => {
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await more(page).click();
  await page.getByRole("button", { name: "Cadenas", exact: true }).first().click();
  await catalog(page, "tejas");
  await page.locator(".chain-card", { hasText: "Tejas" }).click();
  await more(page).click();
  await tab(page, /Obra/).click();
  // 1,5 + 1,5 barro → 3 secaderos (no 2 + 2)
  await expect(page.locator(".brow", { hasText: "Secadero de barro" }).locator(".brow-count")).toHaveText("0/3");
  await page.reload();
  await expect(page.locator(".brow", { hasText: "Secadero de barro" }).locator(".brow-count")).toHaveText("0/3");
});

test("casas: las necesidades se convierten en edificios en la obra", async ({ page }) => {
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await tab(page, /Casas/).click();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "+10 casas: Libertos" }).click();
  await tab(page, /Obra/).click();
  await expect(page.locator(".blist")).toContainText(/Casetas? de pesca/);
  await expect(page.locator(".trade")).toContainText("Cerveza");
  // Desactivar las sardinas quita la caseta de pesca
  await tab(page, /Casas/).click();
  await view(page, "Necesidades");
  await page.getByRole("checkbox", { name: "Sardinas" }).click();
  await tab(page, /Obra/).click();
  await expect(page.locator(".blist")).not.toContainText(/Casetas? de pesca/);
});

test("comercio: el barro de otra isla se construye allí", async ({ page }) => {
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Cantera");
  await page.getByRole("button", { name: "Añadir isla" }).click(); // queda como actual
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await source(page, "Secadero de barro", "Cantera");
  await expect(order(page)).not.toContainText("secaderos");
  await view(page, "Comercio");
  await expect(page.locator(".import-node")).toContainText("Llega de Cantera");
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Cantera/ }).click();
  await tab(page, /Obra/).click();
  await expect(page.locator(".trade")).toContainText("Envías");
  await expect(page.locator(".brow", { hasText: "Secadero de barro" }).locator(".brow-count")).toHaveText("0/9");
});

test("mejoras: productividad a mano y dios patrón", async ({ page }) => {
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await expect(order(page)).toContainText("9 secaderos de barro");
  await view(page, "Edificios");
  const mud = page.locator(".node", { hasText: "Secadero de barro" });
  await mud.getByText(/Productividad 100/).click();
  for (let i = 0; i < 5; i++) await mud.getByRole("button", { name: /Más productividad/ }).click();
  await expect(mud.getByText(/Productividad 150/)).toBeVisible();
  await expect(order(page)).toContainText("6 secaderos de barro");
  await tab(page, /^Isla$/).click();
  await page.locator(".dash-boosts").click(); // Mejoras: pantalla secundaria de la isla
  await page.getByLabel("Dios patrón").selectOption({ label: "Cernunnos" });
  await page.getByLabel("Devoción").selectOption({ index: 9 }); // +100 %
  await tab(page, /Cadenas/).click();
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await view(page, "Edificios");
  await expect(page.locator(".node", { hasText: "Secadero de barro" }).getByText(/Productividad/)).toContainText("250");
});

test("islas: región, idioma y movimiento", async ({ page }) => {
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await expect(page.locator(".island-pill")).toContainText("Roma");
  await tab(page, /Cadenas/).click();
  await page.locator(".catalog-link").click();
  await expect(page.getByRole("heading", { name: "Catálogo · Latium" })).toBeVisible();
  await manage(page);
  await expect(page.locator(".region-group").first()).toContainText("Latium"); // la región de la isla actual va primero
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("radio", { name: "Reducidas" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(page.getByRole("heading", { name: "Jugar con un amigo" })).toBeVisible();
  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Islands" })).toBeVisible();
});

test("cambiar de isla desde la hoja superior", async ({ page }) => {
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Segunda");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await expect(page.locator(".island-pill")).toContainText("Mi isla de Albion");
});

test("importar un archivo inválido no cambia el plan", async ({ page }) => {
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"v":9}') });
  await expect(page.getByRole("alert")).toContainText("no es una partida válida");
});

test("rutas: ver lo que viaja entre islas y lo que falta", async ({ page }) => {
  await tab(page, /Rutas/).click();
  await expect(page.getByText(/varias islas/)).toBeVisible();
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Cantera");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click(); // Roma queda como actual
  await tab(page, /Casas/).click();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "+10 casas: Libertos" }).click();
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await source(page, "Secadero de barro", "Cantera");

  await tab(page, /Rutas/).click();
  await page.getByRole("radio", { name: /^Sin ruta/ }).click();
  await expect(page.locator(".gaps")).toContainText("Cerveza → Roma");
  await page.getByRole("radio", { name: /^Por ruta/ }).click();
  const route = page.locator(".route", { hasText: "Cantera" });
  await expect(route.locator(".route-goods")).toHaveAttribute("aria-label", /Barro/);
  await route.locator(".route-top").click();
  await expect(route).toContainText("Cantera → Mi isla de Albion");
  await expect(route).toContainText("Barro");
  await expect(route.locator(".boat")).toHaveCount(1);
  await route.locator(".route-top").click();
  await expect(route.locator(".boat")).toHaveCount(0);
  await page.getByRole("radio", { name: "Por isla" }).click();
  await page.locator(".route-filter").getByRole("button", { name: "Cantera" }).click();
  const card = (n: string) => page.locator(".isl-io").filter({ has: page.locator("h3", { hasText: n }) });
  await expect(card("Cantera")).toContainText("1 isla depende de ella");
  await expect(card("Roma")).toHaveCount(0);
  // Elegir origen lleva a la obra de Roma
  await page.getByRole("radio", { name: /^Sin ruta/ }).click();
  await page.locator(".gap-row", { hasText: "Cerveza" }).getByRole("button", { name: "Elegir origen" }).click();
  await expect(page.locator(".island-pill")).toContainText("Roma");
  await expect(page.locator(".trade")).toContainText("Cerveza");
});

test("origen repartido: barro de dos islas y una parte aquí", async ({ page }) => {
  await manage(page);
  for (const n of ["Cantera", "Isca"]) {
    await page.getByRole("button", { name: "+ Nueva isla" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill(n);
    await page.getByRole("button", { name: "Añadir isla" }).click();
  }
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await expect(order(page)).toContainText("9 secaderos de barro");
  // Cantera y una parte aquí: la mitad se construye aquí
  await view(page, "Edificios");
  const mud = page.locator(".node", { hasText: "Secadero de barro" });
  await mud.locator(".supply summary").click();
  await mud.getByRole("checkbox", { name: /^Cantera/ }).click();
  await view(page, "Comercio");
  await page.locator(".import-node .supply summary").click();
  await page.locator(".import-node").getByRole("checkbox", { name: /^Esta isla/ }).click();
  await expect(page.locator(".import-node")).toContainText("50 %");
  await expect(order(page)).toContainText("5 secaderos de barro"); // 4,5 → 5
  // Quitar la parte de aquí y añadir Isca con el doble de partes
  await page.locator(".import-node").getByRole("checkbox", { name: /^Esta isla/ }).click();
  await page.locator(".import-node").getByRole("checkbox", { name: /^Isca/ }).click();
  await page.getByRole("button", { name: "Más partes de Isca" }).click();
  await expect(page.locator(".import-node")).toContainText(/Cantera 33 % y Isca 67 %/);
  await expect(page.locator(".inflow")).toContainText("necesita traer 6 t/min");
  await expect(page.locator(".inflow li", { hasText: "Isca" })).toContainText("4 t/min");
  await expect(page.locator(".inflow li", { hasText: "Isca" })).toContainText("≈ 6 secaderos de barro allí");
  await expect(order(page)).not.toContainText("secaderos");
  await tab(page, /Rutas/).click();
  await expect(page.locator(".route", { hasText: "Isca" }).locator(".load")).toContainText(/^4\s*t\/min/);
  await expect(page.locator(".route", { hasText: "Cantera" }).locator(".load")).toContainText(/^2\s*t\/min/);
});

test("atrás del navegador y deslizar para volver", async ({ page }) => {
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await expect(page.getByRole("heading", { name: "Zarzo y argamasa" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: /^Catálogo · / })).toBeVisible();

  // Deslizar a la derecha en una cadena vuelve; a la izquierda en una pestaña pasa a la siguiente.
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (from: number, to: number) => {
    const y = 420;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
    for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from + ((to - from) * i) / 8, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await swipe(60, 360);
  await expect(page.getByRole("heading", { name: /^Catálogo · / })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: /^Cadenas · / })).toBeVisible();
  await swipe(360, 60);
  await expect(tab(page, /Casas/)).toHaveAttribute("aria-current", "page");
});

test("el producto final puede llegar hecho de otra isla", async ({ page }) => {
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Taller");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await catalog(page, "zapatos");
  await page.locator(".chain-card", { hasText: "Zapatos de junco" }).click();
  await page.getByRole("button", { name: "2", exact: true }).first().click();
  await source(page, "Hilandería de zapatos", "Taller");
  await expect(order(page)).toContainText("Todo llega hecho de Taller");
  await view(page, "Comercio");
  await expect(page.locator(".final-import")).toContainText("Llega de Taller");
  await tab(page, /Rutas/).click();
  await expect(page.locator(".route", { hasText: "Taller" }).locator(".route-goods")).toHaveAttribute("aria-label", /Zapatos de junco/);
});

test("casas: escribir el número, población aproximada y servicios", async ({ page }) => {
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await tab(page, /Casas/).click();
  const box = page.getByRole("textbox", { name: "casas: Libertos" });
  await box.fill("127");
  await box.blur();
  await expect(page.locator(".stat-tile").first()).toContainText("762");
  await expect(page.locator(".level", { hasText: "Libertos" })).toContainText("381 trabajadores");
  await view(page, "Necesidades");
  await page.getByRole("checkbox", { name: "Mercado" }).uncheck();
  await expect(page.locator(".stat-tile").first()).not.toContainText("762");
  await view(page, "Población");
  await expect(page.locator(".stat-tile").first()).not.toContainText("762");
});

test("casas: poner los residentes reales del juego", async ({ page }) => {
  await tab(page, /Casas/).click();
  const collapsed = page.locator(".level-collapsed", { hasText: "Mercadores" });
  if (await collapsed.count()) await collapsed.click(); // los niveles sin casas salen plegados
  const box = page.getByRole("textbox", { name: "casas: Mercadores" });
  await box.fill("103"); await box.blur();
  await page.locator(".level", { hasText: "Mercadores" }).locator(".pop-line").click();
  await page.getByRole("textbox", { name: "Residentes en el juego: Mercadores" }).fill("2180");
  await expect(page.locator(".level", { hasText: "Mercadores" })).toContainText("2180 residentes · 654 trabajadores");
  await box.fill("206"); await box.blur();
  await expect(page.locator(".level", { hasText: "Mercadores" })).toContainText("4360 residentes");
});

test("rutas: varias rutas (barcos) entre las mismas dos islas", async ({ page }) => {
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Cantera");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await source(page, "Secadero de barro", "Cantera");
  await source(page, "Recolectoría de junco", "Cantera");
  await tab(page, /Rutas/).click();
  const route = page.locator(".route", { hasText: "Cantera" });
  await expect(route).toContainText("Sin tiempo de viaje");
  await route.locator(".route-top").click();
  await expect(route.locator(".trip-deadline")).toHaveCount(1);
  await route.getByRole("combobox", { name: "Ruta de Junco" }).selectOption({ label: "Ruta nueva" });
  await expect(route.locator(".boat")).toHaveCount(2);
  await expect(route.locator(".trip-deadline")).toHaveCount(2);
  await expect(route.locator(".boat").nth(1)).toContainText("Ruta 2");
  await expect(route.locator(".boat").nth(1)).toContainText("Junco");
  await expect(route.locator(".boat").nth(0)).not.toContainText("Junco");
  const cap = page.getByRole("textbox", { name: "Barco de · Ruta 2" });
  await cap.fill("100"); await cap.blur();
  await expect(route.locator(".boat").nth(1)).toContainText("/ 100 t");
  await expect(page.locator(".route-stats")).toContainText("1ruta");
  // Dos barcos en la ruta 2: cada uno puede tardar el doble
  const before = await route.locator(".boat").nth(1).locator(".trip-deadline").innerText();
  await page.getByRole("button", { name: "+ Barcos en la Ruta 2" }).click();
  await expect(route.locator(".boat").nth(1).locator(".trip-deadline")).toContainText("Cada barco tiene que volver");
  await expect(route.locator(".boat").nth(1).locator(".trip-deadline")).toContainText("Con 2 barcos llega uno cada " + before.match(/cada (\d+ min)/)![1]);
  await page.screenshot({ path: "/tmp/claude-0/boats.png", fullPage: true });
  // Volver a juntarlo en una ruta
  await route.getByRole("combobox", { name: "Ruta de Junco" }).selectOption({ label: "Ruta 1" });
  await expect(route.locator(".boat")).toHaveCount(1);
  // Con una sola ruta también se cambian las toneladas del barco
  const one = page.getByRole("textbox", { name: "Barco de · Ruta 1" });
  await one.fill("150"); await one.blur();
  await expect(route).toContainText("/ 150 t");
  await page.screenshot({ path: "/tmp/claude-0/single.png" });
});

test("contenido de Prophecies of Ash: estatuillas con obsidiana y Vulcano", async ({ page }) => {
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await tab(page, /^Isla$/).click();
  await page.locator(".dash-boosts").click();
  await expect(page.getByRole("combobox").filter({ hasText: "Vulcano" }).or(page.getByText("Vulcano")).first()).toBeAttached();
  await tab(page, /Cadenas/).click();
  await catalog(page, "estatuillas");
  await page.locator(".chain-card", { hasText: "Estatuillas" }).click();
  await more(page).click();
  await view(page, "Edificios");
  await expect(page.locator(".node.final")).toContainText("También gasta Obsidiana");
  await page.screenshot({ path: "/tmp/claude-0/dlc.png", fullPage: true });
});

test("obra: lo que se recibe puede llegar de varias islas", async ({ page }) => {
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Celtium");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await tab(page, /Casas/).click();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "+10 casas: Libertos" }).click();
  await tab(page, /Obra/).click();
  const beer = page.locator(".trade-list li", { hasText: "Cerveza" });
  await beer.locator(".supply summary").click();
  await beer.getByRole("checkbox", { name: /^Celtium/ }).click();
  const got = page.locator(".trade-list li", { hasText: "de Celtium" });
  await expect(got).toContainText("Cerveza");
  await got.locator(".supply summary").click();
  await got.getByRole("checkbox", { name: /^Mi isla de Albion/ }).click();
  await expect(got).toContainText("de Mi isla de Albion");
  await expect(got.locator(".supply summary")).toContainText("Celtium + Mi isla de Albion");
});

test("compatibilidad: islas de una región desconocida se conservan, no se muestran y van en la copia", async ({ page }) => {
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("anno117-planner")!);
    s.islands.push({ id: "eg1", name: "Menfis", region: "Futurus", goals: {}, built: { b990001: 4 }, houses: {}, needsOff: [], supplies: {}, patron: null, events: [], productivity: {}, producers: {}, popReal: {}, nile: "shemu" });
    localStorage.setItem("anno117-planner", JSON.stringify(s));
  });
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "1 isla(s) de una región" })).toBeVisible();
  await page.locator(".island-pill").click();
  await expect(page.getByRole("dialog")).not.toContainText("Menfis");
  await page.keyboard.press("Escape");
  // Editar y crear islas no la toca
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("anno117-planner")!));
  expect(saved.islands.map((i: { name: string }) => i.name)).toEqual(["Mi isla de Albion", "Menfis", "Roma"]);
  expect(saved.islands[1]).toMatchObject({ region: "Futurus", built: { b990001: 4 }, nile: "shemu" });
  // La copia descargada la lleva
  await page.locator(".gear").click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar" }).click()]);
  const text = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
  expect(JSON.parse(text).islands.some((i: { region: string }) => i.region === "Futurus")).toBe(true);
});

test("compatibilidad: copias automáticas visibles, restaurables y con deshacer", async ({ page }) => {
  // La primera copia se guarda al abrir (una sola isla). Después se añade Roma.
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await page.locator(".gear").click();
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Copias automáticas en este dispositivo" }) });
  await expect(card.locator("li")).toHaveCount(1);
  await expect(card.locator("li")).toContainText("1 islas");
  await card.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Copia restaurada.")).toBeVisible();
  const names = () => page.evaluate(() => JSON.parse(localStorage.getItem("anno117-planner")!).islands.map((i: { name: string }) => i.name));
  expect(await names()).toEqual(["Mi isla de Albion"]);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(names).toEqual(["Mi isla de Albion", "Roma"]);
});

test("Dawn of the Delta: activar el DLC, crear una isla de Egipto y planificar con el Nilo", async ({ page }) => {
  await page.locator(".gear").click();
  await page.getByRole("checkbox", { name: /El amanecer del delta/ }).check();
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Menfis");
  await page.getByRole("radio", { name: "Egipto" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await expect(page.locator(".island-pill")).toContainText("Egipto");
  // Casas: los niveles de Egipto
  await tab(page, /Casas/).click();
  await expect(page.getByText("Trilladoras").first()).toBeVisible();
  // Cadena de cebada con la granja de ribera
  await tab(page, /Cadenas/).click();
  await catalog(page, "cebada");
  await page.locator(".chain-card", { hasText: "Cebada" }).first().click();
  await view(page, "Edificios");
  // La granja normal y la de ribera se ven a la vez, cada una con su contador.
  await expect(page.getByRole("article", { name: /de ribera/ })).toContainText("Construidos 0");
  const note = page.locator(".note.nile").first();
  await expect(note).toContainText("se planifica con Media: 1,125 t/min");
  await expect(note).toContainText("Shemu 2 · Ajet 0,25 · Media 1,125");
  // Cambiar la temporada en Islas
  await tab(page, /^Isla$/).click();
  await page.locator(".dash-boosts").click();
  await page.getByRole("radio", { name: "Ajet" }).click();
  await tab(page, /Cadenas/).click();
  await catalog(page, "cebada");
  await page.locator(".chain-card", { hasText: "Cebada" }).first().click();
  await view(page, "Edificios");
  await expect(page.locator(".note.nile").first()).toContainText("se planifica con Ajet: 0,25 t/min");
});

test("pestaña Isla: solo la isla actual, con Región e Imperio; las islas se gestionan aparte", async ({ page }) => {
  await tab(page, /^Isla$/).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Isla · Mi isla de Albion");
  await expect(page.getByRole("radiogroup", { name: "Vista" })).toBeVisible();
  await expect(page.locator(".island-row")).toHaveCount(0);
  await page.getByRole("radio", { name: "Región" }).click();
  await expect(page.getByRole("heading", { name: "Albion · Resumen regional" })).toBeVisible();
  await page.reload();
  await tab(page, /^Isla$/).click();
  await expect(page.getByRole("radio", { name: "Región" })).toBeChecked(); // se recuerda
  await page.getByRole("radio", { name: "Isla" }).click();
  await page.getByRole("button", { name: /Gestionar islas/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Islas");
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await expect(page.locator(".island-row")).toHaveCount(2);
  await page.getByRole("button", { name: /Volver/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Isla · Roma");
});

/** Partida de ejemplo con dos regiones, excedentes y déficits. */
async function seedEmpire(page: Page, view: "region" | "empire") {
  await page.evaluate((v) => {
    const isl = (id: string, name: string, region: string, houses: Record<string, number>, built: Record<string, number>, supplies: Record<string, unknown> = {}) =>
      ({ id, name, region, goals: {}, built, houses, needsOff: [], supplies, patron: null, events: [], productivity: {}, producers: {}, popReal: {} });
    localStorage.setItem("anno117-planner", JSON.stringify({
      v: 2, lang: "es", motion: "reduce", consumption: "Low", mode: "coop", countBuilt: true,
      ships: { capacity: 200, times: {}, loads: {}, boats: {}, caps: {}, counts: {} }, techs: [], dlcs: ["ash", "hippodrome"], session: null, current: "hisp",
      islands: [
        isl("hisp", "Hispania", "Latium", { p1499: 120, p1496: 160 }, { b4831: 2 }, { "2154": "celt" }),
        isl("plan", "Plantatium", "Latium", { p1499: 40 }, { b4831: 6 }),
        isl("celt", "Celtium", "Albion", { p1500: 100, p1501: 60 }, { b5570: 12 }),
      ],
    }));
    localStorage.setItem("anno117-island-view", v);
  }, view);
  await page.reload();
  await tab(page, /^Isla$/).click();
}

test("Región: balance por producto, filtros y desglose por isla", async ({ page }) => {
  await seedEmpire(page, "region");
  await expect(page.getByRole("heading", { name: "Latium · Resumen regional" })).toBeVisible();
  await page.getByRole("radio", { name: /^Déficits/ }).click();
  const beer = page.locator(".eprod", { hasText: "Cerveza" });
  await expect(beer).toContainText("Déficit");
  await beer.locator(".eprod-main").click();
  await expect(beer.locator("table")).toContainText("Plantatium");
  await expect(beer.locator("table")).toContainText("Hispania");
  await page.getByRole("radio", { name: "Albion" }).click();
  await expect(page.getByRole("heading", { name: "Albion · Resumen regional" })).toBeVisible();
});

test("Imperio → Rutas: cancelar no guarda; confirmar asigna el proveedor y la ruta aparece", async ({ page }) => {
  await seedEmpire(page, "empire");
  await page.getByRole("tab", { name: /^Comercio/ }).click();
  await expect(page.getByRole("heading", { name: "Red comercial del Imperio" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Imperio" })).toHaveText("Imperio"); // sin contador en el selector
  await expect(page.locator(".corridor").first()).toContainText("Albion");
  await page.getByRole("button", { name: /Ver mapa/ }).click();
  await expect(page.getByRole("img", { name: "Mapa de envíos entre regiones" })).toBeVisible();
  await expect(page.locator(".corridor .cnum").first()).toHaveText("1"); // el número del carril enlaza con la lista
  await page.getByRole("button", { name: /Ocultar mapa/ }).click();
  const rec = page.locator(".rec", { hasText: "Cerveza → Plantatium" });
  await expect(rec).toContainText("Sin ruta");
  const supplies = () => page.evaluate(() => JSON.parse(localStorage.getItem("anno117-planner")!).islands.find((i: { id: string }) => i.id === "plan").supplies);
  // Cancelar: no cambia nada
  await rec.getByRole("button", { name: "Preparar la ruta" }).click();
  await expect(page.getByLabel("Ruta propuesta · sin guardar")).toContainText("Celtium");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("heading", { name: "Red comercial del Imperio" })).toBeVisible();
  expect(await supplies()).toEqual({});
  // Confirmar: Plantatium recibe la cerveza de Celtium
  await page.locator(".rec", { hasText: "Cerveza → Plantatium" }).getByRole("button", { name: "Preparar la ruta" }).click();
  await page.getByRole("button", { name: "Confirmar el origen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Origen confirmado" })).toBeVisible();
  expect(await supplies()).toEqual({ "2154": "celt" });
  await expect(page.locator(".route.card.focused")).toContainText("Plantatium");
  // Imperio ya no la recomienda; el transporte queda pendiente de comprobar
  await tab(page, /^Isla$/).click();
  await expect(page.locator(".rec", { hasText: "Cerveza → Plantatium" })).toHaveCount(0);
  await expect(page.locator(".rec", { hasText: "Celtium ⇄ Plantatium" })).toContainText("Sin comprobar");
});

test("obra: registrar varios edificios de una vez, buscar y filtrar por categoría", async ({ page }) => {
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await tab(page, /Obra/).click();
  await expect(page.locator(".stat-tile").first()).toContainText("21");
  await page.getByRole("button", { name: /Registrar varios/ }).click();
  // Por defecto, todo lo que falta; se quitan 2 patios de obreros.
  await page.getByRole("button", { name: "Uno menos a registrar: Patio de obreros" }).click();
  await page.getByRole("button", { name: "Registrar 20 edificios" }).click();
  await expect(page.getByText("Registrados 20 edificios.")).toBeVisible();
  // Queda pendiente solo el patio que no se registró.
  await expect(page.locator(".stat-tile").first()).toContainText("1");
  await expect(page.locator(".brow", { hasText: "Patio de obreros" }).locator(".brow-count")).toHaveText("5/6");
  await page.getByRole("radio", { name: /Todo/ }).click();
  await page.getByPlaceholder(/Buscar edificio/).fill("junco");
  await expect(page.locator(".brow")).toHaveCount(1);
  await page.getByPlaceholder(/Buscar edificio/).fill("");
  await page.getByRole("button", { name: "Filtrar por categoría" }).click();
  // Todos estos edificios trabajan para una cadena de construcción.
  await expect(page.locator(".chip-filter").getByRole("button")).toHaveCount(2);
  await page.locator(".chip-filter").getByRole("button", { name: /Construcción|Materiales/ }).click();
  await expect(page.locator(".brow", { hasText: "Patio de obreros" })).toHaveCount(1);
});

test("cadenas: lista con cobertura y filtros Con déficit / Cubiertas", async ({ page }) => {
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await tab(page, /Cadenas/).click();
  await page.getByPlaceholder(/Buscar/).fill("");
  await expect(page.locator(".rate-row", { hasText: "Zarzo y argamasa" })).toContainText("0 %");
  await page.getByRole("radio", { name: /Cubiertas/ }).click();
  await expect(page.locator(".rate-row")).toHaveCount(0);
  await page.getByRole("radio", { name: /Con déficit/ }).click();
  await expect(page.locator(".rate-row", { hasText: "Zarzo y argamasa" })).toBeVisible();
});

test("detalle de cadena: demanda, producción y cobertura en t/min, flujo y comercio", async ({ page }) => {
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  const cards = page.locator(".rate-cards");
  await expect(cards.locator(".rate-card").nth(0)).toContainText("6");
  await expect(cards.locator(".rate-card").nth(1)).toContainText("0");
  await expect(cards.locator(".rate-card").nth(2)).toContainText("0 %");
  await expect(page.locator(".chain-alert")).toContainText("Faltan 6 t/min de");
  await expect(page.locator(".chain-alert")).toContainText("Construye 21 edificios más");
  // Lista corta: − / + y «Falta N»
  const patio = page.locator(".quick-row", { hasText: "Patio de obreros" });
  await expect(patio.locator(".missing-pill")).toHaveText("Falta 6");
  const add = async (name: string, n: number) => {
    const row = page.locator(".quick-row", { hasText: name });
    for (let i = 0; i < n; i++) await row.getByRole("button", { name: /Uno más construido/ }).click();
  };
  // Sin proveedores, los patios no producen nada.
  await add("Patio de obreros", 6);
  await expect(cards.locator(".rate-card").nth(1)).toContainText("0");
  await expect(page.locator(".chain-alert")).toContainText("Lo frena");
  // Todo el barro y la mitad del junco: la cadena produce la mitad.
  await add("Secadero de barro", 9);
  await add("Recolectoría de junco", 3);
  await expect(cards.locator(".rate-card").nth(1)).toContainText("3");
  await expect(cards.locator(".rate-card").nth(2)).toContainText("50 %");
  await expect(page.locator(".chain-alert")).toContainText("Faltan 3 t/min de");
  await expect(page.locator(".chain-alert")).toContainText("Lo frena junco");
  await expect(page.locator(".chain-alert")).toContainText("Construye 3 edificios más");
  await view(page, "Flujo");
  const mud = page.locator(".rf-step", { hasText: "Barro" });
  await expect(mud).toContainText("6 / 6 t/min");
  await expect(mud).toContainText("9 secaderos de barro · 0,67 t/min cada uno");
  await expect(page.locator(".rf-step", { hasText: "Junco" })).toContainText("3 / 6 t/min");
  await expect(page.locator(".rf-step", { hasText: "Zarzo" })).toContainText("6 / 6 t/min");
  await view(page, "Comercio");
  await expect(page.locator(".trade-view")).toContainText("no comercia con otras islas");
});

test("casas: necesidades cubiertas, fuera del plan y consumo por nivel", async ({ page }) => {
  await tab(page, /Casas/).click();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: /^\+10 casas: / }).first().click();
  await view(page, "Necesidades");
  const first = page.locator(".need-row").first();
  await expect(first.locator(".need-pill")).toHaveText(/Con déficit|Sin origen|Llega de fuera/);
  await first.getByRole("checkbox").uncheck();
  await expect(first.locator(".need-pill")).toHaveText("Fuera del plan");
  await page.getByRole("radio", { name: /^Fuera del plan/ }).click();
  await expect(page.locator(".need-row")).toHaveCount(1);
  await view(page, "Por nivel");
  await expect(page.locator(".level-detail")).toContainText("60 casas");
  await expect(page.locator(".consume-list li").first()).toContainText("t/min");
});

test("plan de crecimiento: casas objetivo, población, edificios y se guarda con la partida", async ({ page }) => {
  await tab(page, /^Isla$/).click();
  await page.getByRole("radio", { name: "Imperio" }).click();
  await page.getByRole("tab", { name: /^Plan/ }).click();
  await page.getByRole("button", { name: /^Nuevo plan para/ }).click();
  await expect(page.getByLabel("Nombre del plan")).toHaveValue(/^Crecer /);
  const field = page.getByRole("textbox", { name: /^Casas objetivo: / }).first();
  await field.fill("400");
  await field.blur();
  await expect(page.locator(".rate-card").nth(1)).not.toContainText("≈0");
  await expect(page.locator(".quick-list .quick-row").first()).toContainText("→");
  await expect(page.locator(".consume-list li").first()).toContainText("t/min");
  const growth = () => page.evaluate(() => JSON.parse(localStorage.getItem("anno117-planner")!).growth);
  const saved = await growth();
  expect(saved).toHaveLength(1);
  expect(Object.values(saved[0].houses)).toContain(400);
  // La isla no cambia: es una simulación
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("anno117-planner")!).islands[0].houses ?? {}).reduce((a: number, b) => a + (b as number), 0))).toBe(0);
  await page.getByRole("button", { name: "Borrar el plan" }).click();
  await page.getByRole("button", { name: "Sí, borrar" }).click();
  expect(await growth()).toEqual([]);
});

test("cadena: objetivo en t/min, desglose, productividad de la cadena y déficit aceptado", async ({ page }) => {
  await catalog(page, "zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("radio", { name: "t/min" }).click();
  const field = page.getByRole("textbox", { name: /^Objetivo de .* en t\/min/ });
  await field.fill("4,5");
  await field.blur();
  const cards = page.locator(".rate-cards");
  await expect(cards.locator(".rate-card").nth(0)).toContainText("4½");
  await expect(page.locator(".breakdown")).toContainText("Objetivo en t/min");
  await expect(page.locator(".breakdown .bd-row.total")).toContainText("4½ t/min");
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("anno117-planner")!).islands[0]);
  const isl = await saved();
  expect(Object.values(isl.targets)).toEqual([4.5]);
  expect(Object.values(isl.goals).filter((n) => (n as number) > 0)).toEqual([]);
  // Volver a edificios sustituye el objetivo en t/min (una sola fuente).
  await page.getByRole("radio", { name: "Edificios" }).click();
  await page.getByRole("button", { name: "Uno más", exact: true }).click();
  expect((await saved()).targets ?? {}).toEqual({});
  // Productividad de toda la cadena
  await page.locator(".chain-prod summary").click();
  await page.getByRole("button", { name: "10 % más en toda la cadena" }).click();
  await expect(page.locator(".chain-prod summary")).toContainText("+10 %");
  await expect(page.locator(".prod-list li").first()).toContainText("110 %");
  // Déficit: causas y aceptarlo
  await expect(page.locator(".causes")).toContainText(/Faltan? \d/);
  await page.getByRole("button", { name: "Aceptar este déficit" }).click();
  await expect(page.locator(".chain-alert.accepted")).toContainText("Déficit aceptado");
  await tab(page, /Cadenas/).click();
  await page.getByRole("radio", { name: /^Con déficit/ }).click();
  await expect(page.locator(".rate-row", { hasText: "Barro" })).toBeVisible(); // los intermedios sí cuentan
  await expect(page.locator(".rate-row .rate-top b", { hasText: /^Zarzo/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /^Cubiertas/ }).click();
  await expect(page.locator(".rate-row .rate-top b", { hasText: /^Zarzo/ })).toHaveCount(1);
});

test("varios productores a la vez y de Obra al edificio en su cadena", async ({ page }) => {
  // La mena de oro (lavandería y mina) es de Latium.
  await manage(page);
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await catalog(page, "mena de oro");
  await page.locator(".chain-card", { hasText: "Mena de oro" }).first().click();
  await page.getByRole("radio", { name: "t/min" }).click();
  const field = page.getByRole("textbox", { name: /^Objetivo de .* en t\/min/ });
  await field.fill("1");
  await field.blur();
  await page.getByRole("tab", { name: /^Edificios/ }).click();
  // Los dos productores, cada uno con su contador: no hay que elegir uno.
  const washer = page.getByRole("article", { name: "Lavandería de oro" });
  const mine = page.getByRole("article", { name: "Mina de oro" });
  await expect(washer).toBeVisible();
  await expect(mine).toContainText("Construidos 0");
  await mine.getByRole("button", { name: "Uno más construido: Mina de oro" }).click();
  await expect(mine).toContainText("Construidos 1");
  await washer.getByRole("button", { name: "Uno más construido: Lavandería de oro" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("anno117-planner")!).islands.find((i: { name: string }) => i.name === "Roma").built);
  expect(Object.values(saved).sort()).toEqual([1, 1]);
  // La producción suma los dos.
  await page.getByRole("tab", { name: /^Resumen/ }).click();
  const prod = page.locator(".rate-cards .rate-card").nth(1);
  await expect(prod).toContainText(/0,6|0,7/);
  // Obra → tocar la tarjeta abre la cadena en Edificios con el edificio destacado; Atrás vuelve a Obra.
  await tab(page, /Obra/).click();
  await page.getByRole("radio", { name: /^Todo/ }).click();
  const row = page.locator(".brow", { hasText: "Mina de oro" });
  // + y − cambian la cantidad sin abrir la cadena.
  await row.getByRole("button", { name: "Uno más construido: Mina de oro" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Obra");
  await expect(row.locator(".brow-count")).toContainText("2");
  await row.getByRole("button", { name: "Abrir la cadena de Mina de oro" }).click();
  await expect(page.getByRole("tab", { name: /^Edificios/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("article", { name: "Mina de oro" })).toBeInViewport();
  await page.getByRole("button", { name: /Volver a Obra/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Obra");
});

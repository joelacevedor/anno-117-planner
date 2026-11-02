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
/** Elige de qué isla llega lo que produce un edificio de la cadena. */
async function source(page: Page, building: string, island: string) {
  const node = page.locator(".node", { hasText: building });
  await node.locator(".supply summary").click();
  await node.getByRole("checkbox", { name: new RegExp(`^${island}`) }).click();
}
const more = (page: Page) => page.getByRole("button", { name: "Uno más", exact: true });

test("recorrido principal: cadena → edificios enteros → lo que falta", async ({ page }) => {
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
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
  for (const n of ["Patio de obreros 6", "Recolectoría de junco 6", "Secadero de barro 6"])
    await page.getByRole("button", { name: new RegExp(`^${n}:`) }).click();
  await expect(order(page)).toContainText("Construye 3 secaderos de barro");
  await expect(order(page)).toContainText("4 de 6 patios de obreros");
  await page.getByRole("button", { name: /^Secadero de barro 9:/ }).click();
  await expect(order(page)).toContainText("Listo");
});

test("el buscador encuentra cadenas por producto y por edificio", async ({ page }) => {
  await expect(page.locator(".chain-card").first()).toBeVisible();
  await page.getByPlaceholder(/Buscar/).fill("calzado");
  await expect(page.locator(".chain-card")).toHaveCount(0);
  await page.getByPlaceholder(/Buscar/).fill("zapatos");
  await expect(page.locator(".chain-card", { hasText: "Zapatos de junco" })).toBeVisible();
});

test("obra consolida cadenas que comparten proveedor y persiste al recargar", async ({ page }) => {
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await more(page).click();
  await page.getByRole("button", { name: "Cadenas", exact: true }).first().click();
  await page.getByPlaceholder(/Buscar/).fill("tejas");
  await page.locator(".chain-card", { hasText: "Tejas" }).click();
  await more(page).click();
  await tab(page, /Obra/).click();
  // 1,5 + 1,5 barro → 3 secaderos (no 2 + 2)
  await expect(page.locator(".todo")).toContainText("3Secaderos de barro");
  await page.reload();
  await expect(page.locator(".todo")).toContainText("3Secaderos de barro");
});

test("casas: las necesidades se convierten en edificios en la obra", async ({ page }) => {
  await tab(page, /Islas/).click();
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await tab(page, /Casas/).click();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "+10 casas: Libertos" }).click();
  await tab(page, /Obra/).click();
  await expect(page.locator(".todo")).toContainText(/Casetas? de pesca/);
  await expect(page.locator(".trade")).toContainText("Cerveza");
  // Desactivar las sardinas quita la caseta de pesca
  await tab(page, /Casas/).click();
  await page.getByRole("button", { name: /Necesidades/ }).first().click();
  await page.getByRole("checkbox", { name: "Sardinas" }).click();
  await tab(page, /Obra/).click();
  await expect(page.locator(".todo")).not.toContainText(/Casetas? de pesca/);
});

test("comercio: el barro de otra isla se construye allí", async ({ page }) => {
  await tab(page, /Islas/).click();
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Cantera");
  await page.getByRole("button", { name: "Añadir isla" }).click(); // queda como actual
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await source(page, "Secadero de barro", "Cantera");
  await expect(order(page)).not.toContainText("secaderos");
  await expect(page.locator(".import-node")).toContainText("Llega de Cantera");
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Cantera/ }).click();
  await tab(page, /Obra/).click();
  await expect(page.locator(".trade")).toContainText("Envías");
  await expect(page.locator(".todo")).toContainText("9Secaderos de barro");
});

test("mejoras: productividad a mano y dios patrón", async ({ page }) => {
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await expect(order(page)).toContainText("9 secaderos de barro");
  const mud = page.locator(".node", { hasText: "Secadero de barro" });
  await mud.getByText(/Productividad 100/).click();
  for (let i = 0; i < 5; i++) await mud.getByRole("button", { name: /Más productividad/ }).click();
  await expect(mud.getByText(/Productividad 150/)).toBeVisible();
  await expect(order(page)).toContainText("6 secaderos de barro");
  await tab(page, /Islas/).click();
  await page.getByLabel("Dios patrón").selectOption({ label: "Cernunnos" });
  await page.getByLabel("Devoción").selectOption({ index: 9 }); // +100 %
  await tab(page, /Cadenas/).click();
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await expect(page.locator(".node", { hasText: "Secadero de barro" }).getByText(/Productividad/)).toContainText("250");
});

test("islas: región, idioma y movimiento", async ({ page }) => {
  await tab(page, /Islas/).click();
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await expect(page.locator(".island-pill")).toContainText("Roma");
  await tab(page, /Cadenas/).click();
  await expect(page.getByText(/cadenas de Latium/)).toBeVisible();
  await tab(page, /Islas/).click();
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
  await tab(page, /Islas/).click();
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
  await tab(page, /Islas/).click();
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
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await source(page, "Secadero de barro", "Cantera");

  await tab(page, /Rutas/).click();
  await expect(page.locator(".gaps")).toContainText("Cerveza → Roma");
  const route = page.locator(".route", { hasText: "Cantera" });
  await expect(route).toContainText("Cantera → Mi isla de Albion");
  await expect(route).toContainText("Barro");
  await route.locator(".route-top").click();
  await expect(route).not.toContainText("Barro");
  await page.getByRole("radio", { name: "Por isla" }).click();
  await page.locator(".route-filter").getByRole("button", { name: "Cantera" }).click();
  const card = (n: string) => page.locator(".isl-io").filter({ has: page.locator("h3", { hasText: n }) });
  await expect(card("Cantera")).toContainText("1 isla depende de ella");
  await expect(card("Roma")).toHaveCount(0);
  // Elegir origen lleva a la obra de Roma
  await page.locator(".gap-row", { hasText: "Cerveza" }).getByRole("button", { name: "Elegir origen" }).click();
  await expect(page.locator(".island-pill")).toContainText("Roma");
  await expect(page.locator(".trade")).toContainText("Cerveza");
});

test("origen repartido: barro de dos islas y una parte aquí", async ({ page }) => {
  await tab(page, /Islas/).click();
  for (const n of ["Cantera", "Isca"]) {
    await page.getByRole("button", { name: "+ Nueva isla" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill(n);
    await page.getByRole("button", { name: "Añadir isla" }).click();
  }
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await expect(order(page)).toContainText("9 secaderos de barro");
  // Cantera y una parte aquí: la mitad se construye aquí
  const mud = page.locator(".node", { hasText: "Secadero de barro" });
  await mud.locator(".supply summary").click();
  await mud.getByRole("checkbox", { name: /^Cantera/ }).click();
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
  await expect(page.locator(".route", { hasText: "Isca" })).toContainText("4 t/min");
  await expect(page.locator(".route", { hasText: "Cantera" })).toContainText("2 t/min");
});

test("atrás del navegador y deslizar para volver", async ({ page }) => {
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await expect(page.getByRole("heading", { name: "Zarzo y argamasa" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "¿Qué quieres producir?" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "¿Qué quieres producir?" })).toBeVisible();
  await swipe(360, 60);
  await expect(tab(page, /Casas/)).toHaveAttribute("aria-current", "page");
});

test("el producto final puede llegar hecho de otra isla", async ({ page }) => {
  await tab(page, /Islas/).click();
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Taller");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await page.getByPlaceholder(/Buscar/).fill("zapatos");
  await page.locator(".chain-card", { hasText: "Zapatos de junco" }).click();
  await page.getByRole("button", { name: "2", exact: true }).first().click();
  await source(page, "Hilandería de zapatos", "Taller");
  await expect(order(page)).toContainText("Todo llega hecho de Taller");
  await expect(page.locator(".final-import")).toContainText("Llega de Taller");
  await tab(page, /Rutas/).click();
  await expect(page.locator(".route", { hasText: "Taller" })).toContainText("Zapatos de junco");
});

test("casas: escribir el número, población aproximada y servicios", async ({ page }) => {
  await tab(page, /Islas/).click();
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await tab(page, /Casas/).click();
  const box = page.getByRole("textbox", { name: "casas: Libertos" });
  await box.fill("127");
  await box.blur();
  await expect(page.locator(".pop-summary")).toContainText("762");
  await expect(page.locator(".level", { hasText: "Libertos" })).toContainText("381 trabajadores");
  await page.getByRole("button", { name: /Necesidades/ }).first().click();
  await page.getByRole("checkbox", { name: "Mercado" }).uncheck();
  await expect(page.locator(".pop-summary")).not.toContainText("762");
});

test("casas: poner los residentes reales del juego", async ({ page }) => {
  await tab(page, /Casas/).click();
  const box = page.getByRole("textbox", { name: "casas: Mercadores" });
  await box.fill("103"); await box.blur();
  await page.locator(".level", { hasText: "Mercadores" }).locator(".pop-line").click();
  await page.getByRole("textbox", { name: "Residentes en el juego: Mercadores" }).fill("2180");
  await expect(page.locator(".level", { hasText: "Mercadores" })).toContainText("2180 residentes · 654 trabajadores");
  await box.fill("206"); await box.blur();
  await expect(page.locator(".level", { hasText: "Mercadores" })).toContainText("4360 residentes");
});

test("rutas: varias rutas (barcos) entre las mismas dos islas", async ({ page }) => {
  await tab(page, /Islas/).click();
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Cantera");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await source(page, "Secadero de barro", "Cantera");
  await source(page, "Recolectoría de junco", "Cantera");
  await tab(page, /Rutas/).click();
  const route = page.locator(".route", { hasText: "Cantera" });
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
  await expect(page.locator(".route-stats")).toContainText("2rutas");
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
  await tab(page, /Islas/).click();
  await page.getByRole("button", { name: "+ Nueva isla" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await expect(page.getByRole("combobox").filter({ hasText: "Vulcano" }).or(page.getByText("Vulcano")).first()).toBeAttached();
  await tab(page, /Cadenas/).click();
  await page.getByPlaceholder(/Buscar/).fill("estatuillas");
  await page.locator(".chain-card", { hasText: "Estatuillas" }).click();
  await more(page).click();
  await expect(page.locator(".node.final")).toContainText("También gasta Obsidiana");
  await page.screenshot({ path: "/tmp/claude-0/dlc.png", fullPage: true });
});

test("obra: lo que se recibe puede llegar de varias islas", async ({ page }) => {
  await tab(page, /Islas/).click();
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

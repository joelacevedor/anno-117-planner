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
  await page.getByRole("checkbox", { name: "Sardinas" }).uncheck();
  await tab(page, /Obra/).click();
  await expect(page.locator(".todo")).not.toContainText(/Casetas? de pesca/);
});

test("comercio: el barro de otra isla se construye allí", async ({ page }) => {
  await tab(page, /Islas/).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Cantera");
  await page.getByRole("button", { name: "Añadir isla" }).click(); // queda como actual
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await tab(page, /Cadenas/).click();
  await page.getByPlaceholder(/Buscar/).fill("zarzo");
  await page.locator(".chain-card", { hasText: "Zarzo" }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await page.locator(".node", { hasText: "Secadero de barro" }).getByLabel("Origen").selectOption({ label: "Cantera · Albion" });
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
  await page.getByLabel("Nombre", { exact: true }).fill("Roma");
  await page.getByRole("radio", { name: "Latium" }).click();
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await expect(page.locator(".island-pill")).toContainText("Roma");
  await tab(page, /Cadenas/).click();
  await expect(page.getByText(/cadenas de Latium/)).toBeVisible();
  await tab(page, /Islas/).click();
  await page.getByRole("radio", { name: "Reducidas" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(page.getByRole("heading", { name: "Jugar con un amigo" })).toBeVisible();
  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Islands & settings" })).toBeVisible();
});

test("cambiar de isla desde la hoja superior", async ({ page }) => {
  await tab(page, /Islas/).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Segunda");
  await page.getByRole("button", { name: "Añadir isla" }).click();
  await page.locator(".island-pill").click();
  await page.getByRole("dialog").getByRole("button", { name: /Mi isla de Albion/ }).click();
  await expect(page.locator(".island-pill")).toContainText("Mi isla de Albion");
});

test("importar un archivo inválido no cambia el plan", async ({ page }) => {
  await tab(page, /Islas/).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"v":9}') });
  await expect(page.getByRole("alert")).toContainText("no es una partida válida");
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

const packageDir = new URL("../../", import.meta.url).pathname;
let server;
let browser;
let origin;

async function findPort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) =>
    listener.close((error) => error ? reject(error) : resolve()),
  );
  return port;
}

async function startVite() {
  const port = await findPort();
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    "pnpm",
    ["exec", "vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--strictPort"],
    {
      cwd: packageDir,
      env: { ...process.env, PORT: String(port), BASE_PATH: "/", NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite stopped before starting:\n${output}`);
    try {
      if ((await fetch(`${origin}/OurStory`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  server.kill("SIGTERM");
  throw new Error(`Vite did not become ready:\n${output}`);
}

before(async () => {
  await startVite();
  const executablePath = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";
  await access(executablePath);
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 3000);
      server.once("exit", () => { clearTimeout(timeout); resolve(); });
    });
  }
});

test("Our Story switches between Telugu, Hindi, and approved English copy", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/OurStory`);
    const language = page.getByTestId("select-language");
    const title = page.getByRole("heading", { level: 1 });
    const caption = page.locator(".story-media figcaption");
    const familyParagraph = page.locator(".story-origin-copy p").first();
    const fibreParagraph = page.locator(".story-origin-copy p").nth(2);

    await language.selectOption("te");
    await title.getByText("ప్రతి దారంలో ఒక కథ", { exact: true }).waitFor();
    assert.match(await caption.textContent(), /క్లయింట్ అందించిన దృశ్యం/);
    assert.match(await familyParagraph.textContent(), /మా కథ కుటుంబంతో మొదలైంది/);
    assert.match(await fibreParagraph.textContent(), /నిజమైన అందం దారపు స్వచ్ఛతలోనే ఉందని మేము నమ్ముతాము/);

    await language.selectOption("hi");
    await title.getByText("हर धागे में एक कहानी", { exact: true }).waitFor();
    assert.match(await caption.textContent(), /क्लाइंट द्वारा दिया गया वीडियो/);
    assert.match(await familyParagraph.textContent(), /हमारी शुरुआत परिवार से हुई/);
    assert.match(await fibreParagraph.textContent(), /हम मानते हैं कि असली सुंदरता धागे की शुद्धता में है/);

    await language.selectOption("en");
    await title.getByText("A story in every thread", { exact: true }).waitFor();
    assert.match(await caption.textContent(), /Client-supplied footage · One weaving moment/);
    assert.match(await familyParagraph.textContent(), /Every weave has a story; ours began with family/);
    assert.match(await fibreParagraph.textContent(), /We believe true beauty lies in the purity of the thread/);
  } finally {
    await page.close();
  }
});

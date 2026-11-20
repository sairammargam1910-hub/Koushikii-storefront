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

test("Our Story language persists after reload and returning from another page", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/OurStory`);
    const language = page.getByTestId("select-language");
    const title = page.getByRole("heading", { level: 1 });
    const caption = page.locator(".story-media figcaption");
    const familyParagraph = page.locator(".story-origin-copy p").first();
    const fibreParagraph = page.locator(".story-origin-copy p").nth(2);

    const translations = {
      en: {
        title: "A story in every thread",
        caption: /Client-supplied footage · One weaving moment/,
        family: /Every weave has a story; ours began with family/,
        fibre: /We believe true beauty lies in the purity of the thread/,
      },
      te: {
        title: "ప్రతి దారంలో ఒక కథ",
        caption: /క్లయింట్ అందించిన దృశ్యం/,
        family: /మా కథ కుటుంబంతో మొదలైంది/,
        fibre: /నిజమైన అందం దారపు స్వచ్ఛతలోనే ఉందని మేము నమ్ముతాము/,
      },
      hi: {
        title: "हर धागे में एक कहानी",
        caption: /क्लाइंट द्वारा दिया गया वीडियो/,
        family: /हमारी शुरुआत परिवार से हुई/,
        fibre: /हम मानते हैं कि असली सुंदरता धागे की शुद्धता में है/,
      },
    };
    const expectStoryLanguage = async (selectedLanguage) => {
      const expected = translations[selectedLanguage];
      await language.waitFor({ state: "visible" });
      await page.waitForFunction(
        (value) => document.querySelector(".kq")?.getAttribute("data-lang") === value,
        selectedLanguage,
      );
      assert.equal(await language.inputValue(), selectedLanguage);
      await title.getByText(expected.title, { exact: true }).waitFor();
      assert.match(await caption.textContent(), expected.caption);
      assert.match(await familyParagraph.textContent(), expected.family);
      assert.match(await fibreParagraph.textContent(), expected.fibre);
    };

    for (const selectedLanguage of ["te", "hi"]) {
      await language.selectOption(selectedLanguage);
      await expectStoryLanguage(selectedLanguage);

      await page.reload();
      await expectStoryLanguage(selectedLanguage);

      await page.locator('a[href="/Collections"]').first().click();
      await page.waitForURL(`${origin}/Collections`);
      await page.locator('a[href="/OurStory"]').first().click();
      await page.waitForURL(`${origin}/OurStory`);
      await expectStoryLanguage(selectedLanguage);
    }

    await language.selectOption("en");
    await expectStoryLanguage("en");
  } finally {
    await page.close();
  }
});

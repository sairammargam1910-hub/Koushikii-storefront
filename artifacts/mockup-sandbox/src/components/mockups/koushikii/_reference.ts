import bundledReference from "./_shared/client-reference.html?raw";

// The client's bundled HTML holds the original state outlines and weave notes.
// Read its JSON data only; never evaluate or execute the supplied template script.
const templateMatch = bundledReference.match(/<script[^>]*type=["']__bundler\/template["'][^>]*>([\s\S]*?)<\/script>/);
const source: string = templateMatch ? JSON.parse(templateMatch[1]) : "";
function extract<T>(method: string, fallback: T): T {
  const match = source.match(new RegExp(method + "\\(\\)\\s*\\{\\s*return\\s*(\\{[\\s\\S]*?\\});\\s*\\}"));
  try { return match ? JSON.parse(match[1]) as T : fallback; }
  catch { return fallback; }
}
export const statePaths = extract<Record<string,string>>("paths", {});
export const stateNames = extract<Record<string,string>>("names", {});
export const stateWeaves = extract<Record<string,[string,[string,string][]]>>("weaves", {});

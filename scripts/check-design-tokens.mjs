import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(process.cwd(), "src");
const variablesFile = resolve(root, "app/variables.css");
const variablesSource = readFileSync(variablesFile, "utf8");
const declaredVariables = new Set(
  [...variablesSource.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1])
);
const declaredColors = new Set(
  [...variablesSource.matchAll(/#[\da-f]{6,8}\b/gi)].map((match) => match[0].toLowerCase())
);
const expectedVariables = new Set([
  "--c-stroke",
  "--c-headings",
  "--c-hover",
  "--c-menus-bg",
  "--c-viewport-bg",
  "--btn-check",
  "--btn-check-hover",
  "--btn-check-label",
  "--btn-check-pressed",
  "--btn-gen",
  "--btn-gen-hover",
  "--btn-gen-label",
  "--btn-gen-pressed",
  "--btn-warn",
  "--btn-warn-hover",
  "--btn-warn-label",
  "--btn-warn-text",
  "--btn-warn-pressed",
  "--c-cards-bg",
  "--c-cards-labels",
  "--c-cards-text",
  "--cards-rel-stroke",
  "--cards-age",
  "--cards-dec-width",
  "--comp-pad-vert",
  "--comp-pad-hor",
  "--menus-stroke",
  "--menus-radius",
  "--menus-padding",
  "--p-4",
  "--p-6",
  "--p-8",
  "--p-12",
  "--p-16",
  "--p-20",
  "--p-24",
  "--font-main",
  "--font-cards-label",
  "--font-cards-main",
  "--font-cards-misc",
  "--font-menus",
  "--font-rels",
  "--font-tree-label",
  "--font-weight-bold-small",
  "--font-weight-light",
]);

const files = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if ([".css", ".ts", ".tsx"].includes(extname(path))) files.push(path);
  }
}
walk(root);

const errors = [];
for (const variable of declaredVariables) {
  if (!expectedVariables.has(variable)) {
    errors.push(`src/app/variables.css: переменная ${variable} отсутствует в variables.json`);
  }
}
for (const variable of expectedVariables) {
  if (!declaredVariables.has(variable)) {
    errors.push(`src/app/variables.css: отсутствует переменная ${variable} из variables.json`);
  }
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const name = relative(process.cwd(), file);
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");

  for (const match of withoutComments.matchAll(/var\((--[\w-]+)/g)) {
    if (!declaredVariables.has(match[1])) {
      errors.push(`${name}: ссылка на необъявленную переменную ${match[1]}`);
    }
  }

  if (file !== variablesFile) {
    for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:/g)) {
      errors.push(`${name}: переменная ${match[1]} объявлена вне src/app/variables.css`);
    }
    for (const match of withoutComments.matchAll(/#[\da-f]{6,8}\b/gi)) {
      if (!declaredColors.has(match[0].toLowerCase())) {
        errors.push(`${name}: цвет ${match[0]} отсутствует в variables.css`);
      }
    }
    for (const match of withoutComments.matchAll(/\b\d+(?:\.\d+)?(?:px|rem)\b/g)) {
      errors.push(`${name}: размер ${match[0]} задан вне variables.css`);
    }
  }

  if (/type\s*=\s*["']color["']/.test(withoutComments)) {
    errors.push(`${name}: нативный всплывающий input[type=color] запрещён`);
  }

  if (name.startsWith("src/components/editor/") || name.startsWith("src/app/")) {
    for (const match of withoutComments.matchAll(
      /(?:^|\s)(?:[a-z]+:)*(?:p[trblxy]?|m[trblxy]?|gap|space-[xy])-([1-9]\d*(?:\.\d+)?)(?=\s|["'`])/g
    )) {
      errors.push(`${name}: Tailwind-отступ ${match[0].trim()} не ссылается на токен`);
    }
    if (/\b(?:font-(?:bold|semibold)|text-(?:xs|sm|base|lg|xl)|bg-(?:black|white)|text-(?:black|white))\b/.test(withoutComments)) {
      errors.push(`${name}: найден нетокенизированный Tailwind-стиль`);
    }
    if (/\b(?:size|strokeWidth)=\{\d+(?:\.\d+)?\}/.test(withoutComments)) {
      errors.push(`${name}: размер SVG задан числом вместо токена`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Design token audit passed: ${declaredVariables.size} variables, ${files.length} source files.`
);

/**
 * Values for `names` from a pasted `.env`-style block, as providers show it after creating keys:
 * `NAME="value"`, `NAME='value'`, `NAME=value`, optional `export`, `#` comments. Other names are ignored.
 * Example values (`sk-lf-...`, `<your-key>`), which providers also show, are listed apart and never saved.
 */
export function parseEnvBlock(text: string, names: string[]): { values: Record<string, string>; examples: string[] } {
  const values: Record<string, string> = {};
  const examples: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || !names.includes(match[1])) continue;
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    if (!value) continue;
    if (isExample(value)) examples.push(match[1]);
    else values[match[1]] = value;
  }
  return { values, examples };
}

/** Placeholders shown in docs and setup pages instead of a real value. */
export const isExample = (value: string) => /\.\.\.|…|^<.*>$|^(x+|your[-_ ].*|changeme)$/i.test(value);

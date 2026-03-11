export function toCssClass(value) {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/'/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

const SVG_DATA_URL_PREFIX = /^data:image\/svg\+xml(?:;[^,]*)?,/i;
const SVG_BASE64_DATA_URL_PREFIX = /^data:image\/svg\+xml(?:;[^,]*)?;base64,/i;
const SVG_ELEMENT_PREFIX = /<svg(?:\s|>)/i;
const SVG_PREAMBLE = /^(?:\s*<\?xml[^>]*\?>|\s*<!--[\s\S]*?-->)*\s*$/i;

const extractSvgElement = (value: string): string | null => {
  const document = value.trimStart();
  const svgMatch = document.match(SVG_ELEMENT_PREFIX);
  if (!svgMatch || svgMatch.index === undefined) return null;

  const preamble = document.slice(0, svgMatch.index);
  return SVG_PREAMBLE.test(preamble) ? document.slice(svgMatch.index) : null;
};

/**
 * Supabase Auth returns the TOTP QR code as an SVG data URL whose XML payload
 * uses the `utf-8` token and can include an XML declaration plus line breaks.
 * React Native Web recognizes `utf8` instead and expects the SVG payload on a
 * single line before safely URL-encoding it.
 */
export const normalizeTotpQrCode = (qrCode: string): string => {
  const value = qrCode.trim();
  if (!value || SVG_BASE64_DATA_URL_PREFIX.test(value)) return value;

  const prefix = value.match(SVG_DATA_URL_PREFIX)?.[0];
  const payload = prefix ? value.slice(prefix.length) : value;

  let svg = extractSvgElement(payload);
  if (!svg) {
    try {
      svg = extractSvgElement(decodeURIComponent(payload));
    } catch {
      return value;
    }
  }

  if (!svg) return value;

  const inlineSvg = svg
    .replace(/[\r\n]+/g, ' ');

  return `data:image/svg+xml;utf8,${inlineSvg}`;
};

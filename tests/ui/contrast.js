async function contrast(page, selector, pseudo = null, property = 'color') {
  return page.locator(selector).first().evaluate((element, { pseudoElement, property }) => {
    const parse = value => {
      const parts = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    };
    const blend = (foreground, background) => foreground.slice(0, 3).map((v, i) => v * foreground[3] + background[i] * (1 - foreground[3]));
    const ancestry = [];
    for (let node = element; node; node = node.parentElement) ancestry.unshift(node);
    let background = [255, 255, 255];
    for (const node of ancestry) background = blend(parse(getComputedStyle(node).backgroundColor), background);
    const style = getComputedStyle(element, pseudoElement);
    const foreground = blend(parse(style[property]), background);
    const luminance = rgb => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(foreground);
    const b = luminance(background);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), minimum: property === 'color' ? (large ? 3 : 4.5) : 3, color: style[property], background, text: element.textContent.trim().slice(0, 70) };
  }, { pseudoElement: pseudo, property });
}

module.exports = { contrast };

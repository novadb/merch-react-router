/** The UI texts of a region, read from NovaDB (`i18n.ts` turns them into the texts the site prints). */
import { list } from "./delivery.server";
import { ATTRIBUTE_TEXT, CULTURE, type Labels, type Region } from "./i18n";
import { COLOR_HEX, LABEL, NAME, TYPE } from "./schema";

/** Labels, attribute names and PIM values of a region's content language (five requests, cached like every Delivery read). */
export async function loadLabels(region: Region): Promise<Labels> {
  const culture = CULTURE[region];
  const filter = `meta.apiIdentifier = ${Object.values(ATTRIBUTE_TEXT).join(", ")}`;
  const [labels, attributes, ...values] = (await Promise.all([
    list(TYPE.label, { lang: culture }),
    list(TYPE.attribute, { lang: culture, props: 1, filter }),
    ...[TYPE.color, TYPE.material, TYPE.finish].map((type) => list(type, { lang: culture })),
  ])).map((result) => result.objs);
  const texts: Record<string, string> = {};
  for (const o of labels) if (o.props[LABEL.text] !== undefined) texts[o.props[LABEL.key]] = o.props[LABEL.text];
  for (const o of attributes) if (o.props[NAME] !== undefined) texts[o.meta.apiIdentifier!] = o.props[NAME];
  return {
    texts,
    values: Object.fromEntries(values.flat().map((o) => [o.meta.id, { name: o.props[NAME], hex: o.props[COLOR_HEX] }])),
  };
}

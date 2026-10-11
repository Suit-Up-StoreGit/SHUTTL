import { countries, type TCountryCode } from "countries-list";

export const countryOptions = Object.entries(countries)
  .map(([code, country]) => ({ code, name: country.name }))
  .sort((a, b) => a.name.localeCompare(b.name));
export function validCountry(code: string) {
  return code === "" || Object.hasOwn(countries, code);
}
export function localityKey(country: string, city: string, area: string) {
  const normalize = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  return country && city.trim() && area.trim()
    ? JSON.stringify([country, normalize(city), normalize(area)])
    : "";
}
export function localityLabel(country: string, city: string, area: string) {
  return [area, city, countries[country as TCountryCode]?.name]
    .filter(Boolean)
    .filter(
      (value, index, values) =>
        index === 0 || value.toLowerCase() !== values[index - 1].toLowerCase(),
    )
    .join(" · ");
}

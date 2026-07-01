// Shared bilingual labels for Relatos de Estrada — moto-native structured fields,
// verification levels and field names. Kept next to the schema enums (server.ts).
export type Opt = { value: string; pt: string; en: string };

export const SURFACE: Opt[] = [
  { value: 'asfalto_bom', pt: 'Asfalto bom', en: 'Good asphalt' },
  { value: 'asfalto_ruim', pt: 'Asfalto ruim', en: 'Bad asphalt' },
  { value: 'paralelepipedo', pt: 'Paralelepípedo', en: 'Cobblestone' },
  { value: 'cascalho', pt: 'Cascalho', en: 'Gravel' },
  { value: 'terra', pt: 'Terra', en: 'Dirt' },
  { value: 'misto', pt: 'Misto', en: 'Mixed' },
];
export const SUITABILITY: Opt[] = [
  { value: 'qualquer_moto', pt: 'Qualquer moto', en: 'Any bike' },
  { value: 'melhor_trail', pt: 'Melhor de trail', en: 'Trail preferred' },
  { value: 'evitar_moto_baixa', pt: 'Evitar moto baixa', en: 'Avoid low bikes' },
];
export const TRISTATE: Opt[] = [
  { value: 'sim', pt: 'Sim', en: 'Yes' },
  { value: 'nao', pt: 'Não', en: 'No' },
  { value: 'incerto', pt: 'Incerto', en: 'Unsure' },
];
export const AMENITIES: Opt[] = [
  { value: 'banheiro', pt: 'Banheiro', en: 'Restroom' },
  { value: 'agua', pt: 'Água', en: 'Water' },
  { value: 'sombra', pt: 'Sombra', en: 'Shade' },
  { value: 'comida', pt: 'Comida', en: 'Food' },
  { value: 'combustivel_proximo', pt: 'Combustível perto', en: 'Fuel nearby' },
];
export const GROUP_CAPACITY: Opt[] = [
  { value: 'pequeno', pt: 'Pequeno', en: 'Small' },
  { value: 'medio', pt: 'Médio', en: 'Medium' },
  { value: 'grande', pt: 'Grande', en: 'Large' },
];

export const VERIFICATION: Record<string, { pt: string; en: string }> = {
  verified_qr: { pt: 'Verificado (QR)', en: 'Verified (QR)' },
  verified_gps: { pt: 'Verificado (GPS)', en: 'Verified (GPS)' },
  verified_gpx: { pt: 'Verificado (GPX)', en: 'Verified (GPX)' },
  community: { pt: 'Comunidade', en: 'Community' },
};

// Map of structured-field key → label + the option set used to translate its value.
export const FIELD_DEFS: Record<string, { pt: string; en: string; opts?: Opt[] }> = {
  accessRoadSurface: { pt: 'Piso de acesso', en: 'Access road surface', opts: SURFACE },
  accessSuitability: { pt: 'Que moto chega', en: 'Which bike gets there', opts: SUITABILITY },
  motoParking: { pt: 'Estaciona a moto', en: 'Bike parking', opts: TRISTATE },
  gearStorage: { pt: 'Guarda equipamento', en: 'Gear storage', opts: TRISTATE },
  receivesGroup: { pt: 'Recebe grupo', en: 'Welcomes a group', opts: TRISTATE },
  groupCapacity: { pt: 'Tamanho do grupo', en: 'Group size', opts: GROUP_CAPACITY },
  amenities: { pt: 'Estrutura', en: 'Amenities', opts: AMENITIES },
};

type Lang = 'pt' | 'en';
export const optLabel = (opt: Opt, lang: Lang): string => (lang === 'pt' ? opt.pt : opt.en);
export const verificationLabel = (level: string, lang: Lang): string =>
  VERIFICATION[level] ? VERIFICATION[level][lang] : level;

// Human label for a structured-field key.
export const fieldLabel = (key: string, lang: Lang): string =>
  FIELD_DEFS[key] ? FIELD_DEFS[key][lang] : key;

// Human label for a structured-field value (single value or array).
export const fieldValueLabel = (key: string, value: any, lang: Lang): string => {
  const opts = FIELD_DEFS[key]?.opts;
  const one = (v: any) => {
    const o = opts?.find((x) => x.value === v);
    return o ? optLabel(o, lang) : String(v);
  };
  return Array.isArray(value) ? value.map(one).join(', ') : one(value);
};

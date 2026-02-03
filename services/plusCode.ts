/**
 * Open Location Code (Plus Code) — 순수 JS 디코더/인코더.
 * 패키지 없이 Google OLC 스펙 기반 구현 (지오코딩 시 Plus 주소 지원).
 * @see https://github.com/google/open-location-code
 */

const SEPARATOR = '+';
const SEPARATOR_POSITION = 8;
const PADDING = '0';
const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
const ENCODING_BASE = 20;
const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;
const PAIR_CODE_LENGTH = 10;
const PAIR_FIRST_PLACE_VALUE = Math.pow(ENCODING_BASE, PAIR_CODE_LENGTH / 2 - 1); // 20^4
const PAIR_PRECISION = Math.pow(ENCODING_BASE, 3); // 20^3
const MAX_DIGIT_COUNT = 15;
const GRID_CODE_LENGTH = MAX_DIGIT_COUNT - PAIR_CODE_LENGTH;
const GRID_ROWS = 5;
const GRID_COLUMNS = 4;
const GRID_LAT_FIRST_PLACE_VALUE = Math.pow(GRID_ROWS, GRID_CODE_LENGTH - 1);
const GRID_LNG_FIRST_PLACE_VALUE = Math.pow(GRID_COLUMNS, GRID_CODE_LENGTH - 1);
const FINAL_LAT_PRECISION = PAIR_PRECISION * Math.pow(GRID_ROWS, MAX_DIGIT_COUNT - PAIR_CODE_LENGTH);
const FINAL_LNG_PRECISION = PAIR_PRECISION * Math.pow(GRID_COLUMNS, MAX_DIGIT_COUNT - PAIR_CODE_LENGTH);

function clipLatitude(lat: number): number {
  return Math.min(90, Math.max(-90, lat));
}

function normalizeLongitude(lng: number): number {
  let x = lng;
  while (x < -180) x += 360;
  while (x >= 180) x -= 360;
  return x;
}

export function isValid(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const sepIdx = code.indexOf(SEPARATOR);
  if (sepIdx === -1 || sepIdx !== code.lastIndexOf(SEPARATOR)) return false;
  if (code.length === 1) return false;
  if (sepIdx > SEPARATOR_POSITION || sepIdx % 2 === 1) return false;
  const cleaned = code.replace(new RegExp('\\' + SEPARATOR + '+'), '').replace(new RegExp(PADDING + '+'), '').toUpperCase();
  for (let i = 0; i < cleaned.length; i++) {
    if (CODE_ALPHABET.indexOf(cleaned[i]) === -1) return false;
  }
  if (cleaned.length === 1) return false;
  return true;
}

export function isShort(code: string): boolean {
  if (!isValid(code)) return false;
  const sepIdx = code.indexOf(SEPARATOR);
  return sepIdx >= 0 && sepIdx < SEPARATOR_POSITION;
}

export function isFull(code: string): boolean {
  if (!isValid(code)) return false;
  if (isShort(code)) return false;
  const c = code.replace(SEPARATOR, '').replace(/0/g, '').toUpperCase();
  const firstLat = CODE_ALPHABET.indexOf(c[0]) * ENCODING_BASE;
  if (firstLat >= LATITUDE_MAX * 2) return false;
  if (c.length > 1) {
    const firstLng = CODE_ALPHABET.indexOf(c[1]) * ENCODING_BASE;
    if (firstLng >= LONGITUDE_MAX * 2) return false;
  }
  return true;
}

export interface CodeArea {
  latitudeCenter: number;
  longitudeCenter: number;
  latitudeLo: number;
  longitudeLo: number;
  latitudeHi: number;
  longitudeHi: number;
  codeLength: number;
}

export function decode(code: string): CodeArea {
  if (!isFull(code)) throw new Error('Invalid full Plus Code: ' + code);
  let c = code.replace(SEPARATOR, '').replace(/0/g, '').toUpperCase();
  let normalLat = -LATITUDE_MAX * PAIR_PRECISION;
  let normalLng = -LONGITUDE_MAX * PAIR_PRECISION;
  let gridLat = 0;
  let gridLng = 0;
  const digits = Math.min(c.length, PAIR_CODE_LENGTH);
  let pv = PAIR_FIRST_PLACE_VALUE;
  for (let i = 0; i < digits; i += 2) {
    normalLat += CODE_ALPHABET.indexOf(c[i]) * pv;
    normalLng += CODE_ALPHABET.indexOf(c[i + 1]) * pv;
    if (i < digits - 2) pv /= ENCODING_BASE;
  }
  let latPrecision = pv / PAIR_PRECISION;
  let lngPrecision = pv / PAIR_PRECISION;
  if (c.length > PAIR_CODE_LENGTH) {
    let rowpv = GRID_LAT_FIRST_PLACE_VALUE;
    let colpv = GRID_LNG_FIRST_PLACE_VALUE;
    const gridDigits = Math.min(c.length, MAX_DIGIT_COUNT);
    for (let i = PAIR_CODE_LENGTH; i < gridDigits; i++) {
      const digitVal = CODE_ALPHABET.indexOf(c[i]);
      const row = Math.floor(digitVal / GRID_COLUMNS);
      const col = digitVal % GRID_COLUMNS;
      gridLat += row * rowpv;
      gridLng += col * colpv;
      if (i < gridDigits - 1) {
        rowpv /= GRID_ROWS;
        colpv /= GRID_COLUMNS;
      }
    }
    latPrecision = rowpv / FINAL_LAT_PRECISION;
    lngPrecision = colpv / FINAL_LNG_PRECISION;
  }
  let lat = normalLat / PAIR_PRECISION + gridLat / FINAL_LAT_PRECISION;
  let lng = normalLng / PAIR_PRECISION + gridLng / FINAL_LNG_PRECISION;
  lat = Math.round(lat * 1e14) / 1e14;
  lng = Math.round(lng * 1e14) / 1e14;
  const latitudeHi = Math.round((lat + latPrecision) * 1e14) / 1e14;
  const longitudeHi = Math.round((lng + lngPrecision) * 1e14) / 1e14;
  const codeLength = Math.min(c.length, MAX_DIGIT_COUNT);
  const latitudeCenter = Math.min(lat + (latitudeHi - lat) / 2, LATITUDE_MAX);
  const longitudeCenter = Math.min(lng + (longitudeHi - lng) / 2, LONGITUDE_MAX);
  return {
    latitudeLo: lat,
    longitudeLo: lng,
    latitudeHi,
    longitudeHi,
    latitudeCenter,
    longitudeCenter,
    codeLength
  };
}

export function encode(latitude: number, longitude: number, codeLength: number = 10): string {
  let lat = clipLatitude(Number(latitude));
  let lng = normalizeLongitude(Number(longitude));
  const len = Math.min(MAX_DIGIT_COUNT, Math.max(2, codeLength));
  if (lat === 90) lat = lat - Math.pow(ENCODING_BASE, Math.floor(len / -2 + 2));
  const latVal = Math.floor(Math.round((lat + LATITUDE_MAX) * FINAL_LAT_PRECISION * 1e6) / 1e6);
  const lngVal = Math.floor(Math.round((lng + LONGITUDE_MAX) * FINAL_LNG_PRECISION * 1e6) / 1e6);
  let code = '';
  if (len > PAIR_CODE_LENGTH) {
    let latV = latVal;
    let lngV = lngVal;
    for (let i = 0; i < GRID_CODE_LENGTH; i++) {
      const ndx = (latV % GRID_ROWS) * GRID_COLUMNS + (lngV % GRID_COLUMNS);
      code = CODE_ALPHABET[ndx] + code;
      latV = Math.floor(latV / GRID_ROWS);
      lngV = Math.floor(lngV / GRID_COLUMNS);
    }
    latV = Math.floor(latVal / Math.pow(GRID_ROWS, GRID_CODE_LENGTH));
    lngV = Math.floor(lngVal / Math.pow(GRID_COLUMNS, GRID_CODE_LENGTH));
    for (let i = 0; i < PAIR_CODE_LENGTH / 2; i++) {
      code = CODE_ALPHABET[lngV % ENCODING_BASE] + code;
      code = CODE_ALPHABET[latV % ENCODING_BASE] + code;
      latV = Math.floor(latV / ENCODING_BASE);
      lngV = Math.floor(lngV / ENCODING_BASE);
    }
  } else {
    let latV = Math.floor(latVal / Math.pow(GRID_ROWS, GRID_CODE_LENGTH));
    let lngV = Math.floor(lngVal / Math.pow(GRID_COLUMNS, GRID_CODE_LENGTH));
    for (let i = 0; i < PAIR_CODE_LENGTH / 2; i++) {
      code = CODE_ALPHABET[lngV % ENCODING_BASE] + code;
      code = CODE_ALPHABET[latV % ENCODING_BASE] + code;
      latV = Math.floor(latV / ENCODING_BASE);
      lngV = Math.floor(lngV / ENCODING_BASE);
    }
  }
  code = code.substring(0, SEPARATOR_POSITION) + SEPARATOR + code.substring(SEPARATOR_POSITION);
  if (len >= SEPARATOR_POSITION) return code.substring(0, len + 1);
  return code.substring(0, len) + Array(SEPARATOR_POSITION - len + 1).join(PADDING) + SEPARATOR;
}

/**
 * 짧은 Plus Code를 기준 좌표로 복원한 전체 코드 반환.
 */
export function recoverNearest(shortCode: string, referenceLatitude: number, referenceLongitude: number): string {
  if (isFull(shortCode)) return shortCode.toUpperCase();
  if (!isShort(shortCode)) throw new Error('Invalid short Plus Code: ' + shortCode);
  const refLat = clipLatitude(Number(referenceLatitude));
  const refLng = normalizeLongitude(Number(referenceLongitude));
  const cleaned = shortCode.toUpperCase();
  const sepIdx = cleaned.indexOf(SEPARATOR);
  const paddingLength = SEPARATOR_POSITION - sepIdx;
  const resolution = Math.pow(20, 2 - paddingLength / 2);
  const halfResolution = resolution / 2;
  const prefix = encode(refLat, refLng, 10).replace(SEPARATOR, '').substring(0, paddingLength);
  const fullCodeStr = prefix + cleaned;
  let codeArea = decode(fullCodeStr);
  let latC = codeArea.latitudeCenter;
  let lngC = codeArea.longitudeCenter;
  if (refLat + halfResolution < latC && latC - resolution >= -LATITUDE_MAX) latC -= resolution;
  else if (refLat - halfResolution > latC && latC + resolution <= LATITUDE_MAX) latC += resolution;
  if (refLng + halfResolution < lngC) lngC -= resolution;
  else if (refLng - halfResolution > lngC) lngC += resolution;
  return encode(latC, lngC, codeArea.codeLength);
}

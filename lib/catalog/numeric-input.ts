/** Accept explicit decimal numbers, never boolean/object/blank coercions to zero. */
export function isNumericInput(value:unknown):value is number|string{
 return typeof value==='number'?Number.isFinite(value):typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())&&Number.isFinite(Number(value));
}

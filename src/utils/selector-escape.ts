/**
 * Escapes special characters in CSS selector identifiers (IDs, classes, attribute values)
 * Uses CSS.escape() if available, otherwise provides a fallback implementation
 * 
 * @param identifier - The identifier to escape (e.g., an ID like ":1l" or class name)
 * @returns The escaped identifier safe for use in CSS selectors
 */
export function escapeSelector(identifier: string): string {
  // Use native CSS.escape if available (modern browsers)
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(identifier);
  }
  
  // Fallback implementation for older browsers
  // Escapes special characters according to CSS spec
  return identifier.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/**
 * Escapes a value for use in CSS attribute selectors
 * Handles quotes and special characters in attribute values
 * 
 * @param value - The attribute value to escape
 * @returns The escaped value safe for use in attribute selectors
 */
export function escapeAttributeValue(value: string): string {
  // If value contains quotes, escape them
  if (value.includes('"')) {
    return value.replace(/"/g, '\\"');
  }
  // If value contains single quotes, escape them
  if (value.includes("'")) {
    return value.replace(/'/g, "\\'");
  }
  return value;
}


export interface BlurRule {
  urlPattern: string;
  selectors: string[];
  enabled: boolean;
}

export interface BlurRegion {
  urlPattern: string;
  x: number;
  y: number;
  width: number;
  height: number;
  containerSelector?: string;
}

export interface SiteSettings {
  enabled: boolean;
  blurIntensity: number;
  hoverToUnblur: boolean;
}

export interface ExtensionState {
  rules: BlurRule[];
  regions: BlurRegion[];
  siteSettings: Record<string, SiteSettings>;
  globalEnabled: boolean;
}

export const DEFAULT_BLUR_INTENSITY = 8;
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  enabled: true,
  blurIntensity: DEFAULT_BLUR_INTENSITY,
  hoverToUnblur: false,
};


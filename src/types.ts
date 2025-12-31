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

export interface BlurGroupSelectors {
  avatar: string[];
  conversation: string[];
  messages: string[];
}

export interface SiteSettings {
  blurIntensity: number;
  blurAvatars?: boolean;
  blurConversationList?: boolean;
  blurMessages?: boolean;
  selectors?: BlurGroupSelectors;
}

export interface ExtensionState {
  rules: BlurRule[];
  regions: BlurRegion[];
  siteSettings: Record<string, SiteSettings>;
  globalEnabled: boolean;
}

export const DEFAULT_BLUR_INTENSITY = 8;
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  blurIntensity: DEFAULT_BLUR_INTENSITY,
};


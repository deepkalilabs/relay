import type { CaptchaStatus } from "@/lib/protocol";

export interface BrowserPageState {
  pageId: string;
  title: string;
  url: string;
}

export interface PopupState {
  pageId: string;
  title: string;
  url: string;
}

export interface DatePickerState {
  requestId: string;
  value: string;
  min: string;
  max: string;
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
}

export interface SelectPickerState {
  requestId: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string; disabled: boolean }>;
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
}

export interface BrowserNavigationState {
  enabled: boolean;
  pending: boolean;
  error: string | null;
}

export interface BrowserViewModel {
  page: BrowserPageState | null;
  liveViewUrl: string | null;
  popup: PopupState | null;
  datePicker: DatePickerState | null;
  selectPicker: SelectPickerState | null;
  captchaStatus: CaptchaStatus | null;
  nativeSelects: boolean;
  nativeSelectsEnabled: boolean;
  preparing: boolean;
  reconnecting: boolean;
  restoreFocusAfterCaptcha: boolean;
  navigation: BrowserNavigationState;
}

export interface BrowserActions {
  goBack: () => void;
  goForward: () => void;
  navigate: (url: string) => void;
  reload: () => void;
  switchPopup: (pageId: string) => void;
  selectDate: (requestId: string, value: string) => void;
  dismissDatePicker: (requestId: string) => void;
  selectPickerOption: (requestId: string, value: string) => void;
  dismissSelectPicker: (requestId: string) => void;
  setNativeSelects: (enabled: boolean) => void;
  continueAfterCaptcha: () => void;
}

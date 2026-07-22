export interface CaptureRequest {
  url?: string;
  htmlContent?: string;
  format: 'png' | 'jpeg' | 'pdf';
  fullPage: boolean;
  selector?: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  pdfBreakAvoidSelectors?: string;
  pdfMargin?: string;
  splitLongImage?: boolean;
  splitMaxHeight?: number;
  watermarkEnabled?: boolean;
  watermarkName?: string;
  watermarkText?: string;
  watermarkLogo?: string;
  watermarkQr?: string;
  watermarkPosition?: 'top' | 'bottom';
}

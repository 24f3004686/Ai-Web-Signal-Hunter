declare module 'robots-parser' {
  export interface Robot {
    isAllowed(url: string, ua?: string): boolean | undefined;
    isDisallowed(url: string, ua?: string): boolean | undefined;
    getCrawlDelay(ua?: string): number | undefined;
    getSitemaps(): string[];
  }
  export default function robotsParser(url: string, contents: string): Robot;
}

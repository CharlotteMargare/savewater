import { SDK_CDN_URL } from "./constants";

declare global {
  interface Window {
    relayerSDK: any;
  }
}

export class RelayerSDKLoader {
  public load(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ("relayerSDK" in window) return resolve();
      const script = document.createElement("script");
      script.src = SDK_CDN_URL;
      script.type = "text/javascript";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load Relayer SDK from ${SDK_CDN_URL}`));
      document.head.appendChild(script);
    });
  }
}




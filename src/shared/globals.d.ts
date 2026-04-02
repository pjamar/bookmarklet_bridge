declare const browser: {
  runtime: {
    onMessage: {
      addListener(
        callback: (
          message: any,
          sender?: {
            tab?: {
              id?: number;
            };
          }
        ) => Promise<unknown> | unknown
      ): void;
    };
    sendMessage(message: any): Promise<any>;
    openOptionsPage(): Promise<void>;
  };
  browserAction: {
    onClicked: {
      addListener(callback: () => void | Promise<void>): void;
    };
  };
  storage: {
    local: {
      get(key?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
};

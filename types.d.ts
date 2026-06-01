import '@wxt-dev/browser';

declare module '@wxt-dev/browser' {
  namespace Browser {
    namespace tabs {
      interface Tab {
        cookieStoreId?: string;
      }
      interface UpdateProperties {
        cookieStoreId?: string;
      }
      interface CreateProperties {
        cookieStoreId?: string;
      }
      interface OnUpdatedInfo {
        status?: string;
      }
    }
    namespace contextualIdentities {
      interface ContextualIdentity {
        name: string;
        color: string;
        icon: string;
        cookieStoreId: string;
      }
      function create(details: {
        name: string;
        color?: string;
        icon?: string;
      }): Promise<ContextualIdentity>;
      function query(details: object): Promise<ContextualIdentity[]>;
      function update(
        cookieStoreId: string,
        details: { name?: string; color?: string; icon?: string }
      ): Promise<ContextualIdentity>;
      function remove(cookieStoreId: string): Promise<void>;
    }
  }
}

declare global {
  namespace chrome {
    namespace cookies {
      interface Cookie {
        name: string;
        value: string;
        domain: string;
        path: string;
        secure: boolean;
        httpOnly: boolean;
        sameSite: 'no_restriction' | 'lax' | 'strict' | 'unspecified';
        expirationDate?: number;
      }

      interface CookieChangeInfo {
        removed: boolean;
        cookie: Cookie;
      }

      function getAll(details: { domain: string }): Promise<Cookie[]>;
      function set(details: {
        url: string;
        name: string;
        value: string;
        domain?: string;
        path?: string;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: string;
        expirationDate?: number;
      }): Promise<Cookie | null>;
      function remove(details: {
        url: string;
        name: string;
      }): Promise<{ url: string; name: string } | null>;

      const onChanged: {
        addListener(callback: (changeInfo: CookieChangeInfo) => void): void;
      };
    }

    namespace webRequest {
      interface WebRequestEvent {
        addListener(
          callback: (...args: unknown[]) => void,
          filter: { urls: string[] },
          extra?: string[]
        ): void;
        removeListener(callback: (...args: unknown[]) => void): void;
      }

      const onBeforeRequest: WebRequestEvent;
    }

    namespace storage {
      namespace local {
        function get(keys: string | string[] | null): Promise<Record<string, unknown>>;
        function set(items: Record<string, unknown>): Promise<void>;
        function remove(keys: string | string[]): Promise<void>;
      }
      namespace session {
        function get(keys: string | string[]): Promise<Record<string, unknown>>;
        function set(items: Record<string, unknown>): Promise<void>;
        function remove(keys: string | string[]): Promise<void>;
      }
    }
  }
}

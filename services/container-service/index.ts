export type { ContainerInfo, ContainerMetaMap, ContainerService, StorageItemLike } from './types';

export { FirefoxContainerService } from './firefox';
export { ChromeContainerService } from './chrome';
export { hasBlockingWebRequest } from './utils';

import type { ProxyServiceKey } from '@webext-core/proxy-service';
import { createProxyService } from '@webext-core/proxy-service';
import type { ContainerService } from './types';

export type ContainerProxyService = Pick<
  ContainerService,
  'create' | 'query' | 'update' | 'remove' | 'registerAccount'
>;

export const CONTAINER_SERVICE_KEY = 'container-service' as ProxyServiceKey<ContainerProxyService>;
export const containerService: ContainerProxyService = createProxyService(CONTAINER_SERVICE_KEY);

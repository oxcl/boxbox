import type { Account } from '@/services/storage';
import type { ContainerInfo } from '@/services/container-service';

export interface AppData {
  hostname: string | null;
  containers: ContainerInfo[];
  currentAccounts: Account[];
  lastSelectedId: string | null;
}
